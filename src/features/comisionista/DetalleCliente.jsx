import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { listarPrestamosPorCliente } from '../../services/prestamosService'
import { recalcularEstadoCliente } from '../../services/clienteEstadoService'
import { EtiquetaEstadoCliente } from '../shared/EtiquetaEstadoCliente'
import { BotonOfrecerRenovacion } from '../shared/BotonOfrecerRenovacion'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { TIPO_CUOTA_LABELS, ESTADO_SOLICITUD } from '../../models/prestamo'
import { debeOfrecerRenovacion, obtenerPrestamoVigente } from '../../utils/renovacion'
import { construirLinkWhatsapp } from '../../utils/whatsapp'

export default function DetalleCliente() {
  const { clienteId } = useParams()
  const navigate = useNavigate()
  const { esMaestro } = useRole()
  const { usuarioAuth } = useAuth()
  const [cliente, setCliente] = useState(null)
  const [prestamos, setPrestamos] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      try {
        const [snapCliente, listaPrestamos] = await Promise.all([
          getDoc(doc(db, 'clientes', clienteId)),
          listarPrestamosPorCliente(clienteId),
        ])
        if (snapCliente.exists()) {
          setCliente({ id: snapCliente.id, ...snapCliente.data() })
        }
        setPrestamos(listaPrestamos)

        // Self-heal: recalcula la etiqueta por si pasaron dias desde el
        // ultimo pago sin que nadie haya entrado a ver a este cliente.
        // Sin comisionistaId (caso Maestro) no se filtra la consulta de
        // cuotas, ver clienteEstadoService.js.
        const nuevoEstado = await recalcularEstadoCliente(
          clienteId,
          esMaestro ? undefined : usuarioAuth?.uid
        )
        if (nuevoEstado) {
          setCliente((prev) => (prev ? { ...prev, estado: nuevoEstado } : prev))
        }
      } catch (err) {
        console.error('[DetalleCliente]', err)
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [clienteId, esMaestro, usuarioAuth])

  if (cargando) {
    return <Cargando />
  }

  if (!cliente) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Cliente no encontrado.
      </div>
    )
  }

  const totalPrestado = prestamos.reduce((acc, p) => acc + (p.montoPrestado || 0), 0)
  // Regla de negocio: un cliente solo puede tener un prestamo vigente a
  // la vez. Mientras exista uno, no se ofrece "+ Nuevo prestamo" — solo
  // se puede renovar (boton dentro de la tarjeta de ese prestamo).
  const prestamoVigente = obtenerPrestamoVigente(prestamos)
  // Mas nuevo primero: el prestamo vigente (creado despues que el que
  // renovo) siempre sube al tope sin necesitar logica especial, y los
  // renovados van quedando mas abajo a medida que se acumula historial.
  const prestamosOrdenados = [...prestamos].sort((a, b) => {
    const fa = a.creadoEn?.toDate ? a.creadoEn.toDate() : new Date(a.creadoEn || 0)
    const fb = b.creadoEn?.toDate ? b.creadoEn.toDate() : new Date(b.creadoEn || 0)
    return fb - fa
  })

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <button
          onClick={() => navigate(-1)}
          className="text-xl leading-none text-ink-soft"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Cliente
          </p>
          <h1 className="text-lg font-semibold text-ink truncate">{cliente.nombre}</h1>
        </div>
        <EtiquetaEstadoCliente estado={cliente.estado} />
      </header>

      <div className="mx-auto max-w-lg px-4 py-5 space-y-5">
        {/* Datos del cliente */}
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Datos personales
          </h2>
          <div className="space-y-2 text-sm">
            <Dato label="DNI" valor={cliente.dni} />
            {cliente.telefono && (
              <Dato
                label="Telefono"
                valor={
                  <span className="inline-flex items-center gap-2">
                    {cliente.telefono}
                    {construirLinkWhatsapp(cliente.telefono) && (
                      <a
                        href={construirLinkWhatsapp(cliente.telefono)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ubicar a ${cliente.nombre} por WhatsApp`}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-success/30 bg-success-soft text-sm text-success active:scale-95 transition-transform"
                      >
                        💬
                      </a>
                    )}
                  </span>
                }
              />
            )}
            {cliente.direccion && <Dato label="Direccion" valor={cliente.direccion} />}
            {prestamos.length > 0 && (
              <Dato
                label="Total prestado"
                valor={
                  <span className="money font-semibold text-brand">
                    S/ {totalPrestado.toFixed(2)}
                  </span>
                }
              />
            )}
          </div>
        </section>

        {/* Lista de prestamos */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            Prestamos ({prestamos.length})
          </h2>
          {!esMaestro && !prestamoVigente && (
            <Link
              to={`/clientes/${clienteId}/prestamos/nuevo`}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              + Nuevo prestamo
            </Link>
          )}
        </div>

        {!esMaestro && prestamoVigente && (
          <p className="text-xs text-ink-soft -mt-2">
            {prestamoVigente.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE
              ? 'Tiene una solicitud pendiente de aprobacion. No se puede registrar otro prestamo.'
              : debeOfrecerRenovacion(prestamoVigente)
              ? 'Ya tiene un prestamo activo: solo puede renovarlo (ver abajo).'
              : 'Ya tiene un prestamo activo. Podra renovarlo cuando pague la primera cuota.'}
          </p>
        )}

        {prestamos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            Este cliente aun no tiene prestamos registrados.
          </div>
        )}

        <ul className="space-y-3">
          {prestamosOrdenados.map((p) => {
            const pagadas = p.cuotasPagadas || 0
            const total = p.totalCuotas || 0
            const progreso = total > 0 ? Math.round((pagadas / total) * 100) : 0

            return (
              <li key={p.id} className={p.renovado ? 'opacity-60' : undefined}>
                <Link
                  to={`/prestamos/${p.id}/cuotas`}
                  className="block rounded-2xl border border-line bg-surface p-4 active:bg-paper transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="money text-xl font-bold text-ink">
                        S/ {(p.montoPrestado || 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {TIPO_CUOTA_LABELS[p.tipoCuota]} · {p.tasaInteres}% interes
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        p.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE
                          ? 'bg-gold-soft text-gold'
                          : p.estadoSolicitud === ESTADO_SOLICITUD.RECHAZADO
                          ? 'bg-danger-soft text-danger'
                          : p.renovado
                          ? 'bg-line text-ink-soft'
                          : pagadas === total && total > 0
                          ? 'bg-success-soft text-success'
                          : 'bg-warning-soft text-warning'
                      }`}
                    >
                      {p.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE
                        ? 'Pendiente'
                        : p.estadoSolicitud === ESTADO_SOLICITUD.RECHAZADO
                        ? 'Rechazado'
                        : p.renovado
                        ? 'Renovado'
                        : pagadas === total && total > 0
                        ? 'Cancelado'
                        : 'Activo'}
                    </span>
                  </div>

                  {/* Barra de progreso */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-ink-soft">
                      <span>{pagadas}/{total} cuotas pagadas</span>
                      <span>{progreso}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                  </div>

                  {p.montoSeguro > 0 && (
                    <p className="mt-2 text-xs text-ink-soft">
                      Seguro:{' '}
                      <span className="money">S/ {p.montoSeguro.toFixed(2)}</span>
                    </p>
                  )}
                </Link>

                {/* Fuera del Link a proposito: un <a> no puede contener
                    otro <a>. BotonOfrecerRenovacion trae su propio
                    margen superior para separarse visualmente de la
                    tarjeta del prestamo. */}
                {!esMaestro && (
                  <BotonOfrecerRenovacion prestamo={p} clienteId={clienteId} />
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function Dato({ label, valor }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="text-ink font-medium">{valor}</span>
    </div>
  )
}

function Cargando() {
  return (
    <div className="flex min-h-screen items-center justify-center text-ink-soft">
      Cargando...
    </div>
  )
}
