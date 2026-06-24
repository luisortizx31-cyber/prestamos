import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { listarPrestamosPorCliente } from '../../services/prestamosService'
import { recalcularEstadoCliente } from '../../services/clienteEstadoService'
import { EtiquetaEstadoCliente } from '../shared/EtiquetaEstadoCliente'
import { BotonOfrecerRenovacion } from '../shared/BotonOfrecerRenovacion'
import { useRole } from '../../hooks/useRole'
import { TIPO_CUOTA_LABELS } from '../../models/prestamo'

export default function DetalleCliente() {
  const { clienteId } = useParams()
  const navigate = useNavigate()
  const { esMaestro } = useRole()
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
        const nuevoEstado = await recalcularEstadoCliente(clienteId)
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
  }, [clienteId])

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
            {cliente.telefono && <Dato label="Telefono" valor={cliente.telefono} />}
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
          {!esMaestro && (
            <Link
              to={`/clientes/${clienteId}/prestamos/nuevo`}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              + Nuevo prestamo
            </Link>
          )}
        </div>

        {prestamos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            Este cliente aun no tiene prestamos registrados.
          </div>
        )}

        <ul className="space-y-3">
          {prestamos.map((p) => {
            const pagadas = p.cuotasPagadas || 0
            const total = p.totalCuotas || 0
            const progreso = total > 0 ? Math.round((pagadas / total) * 100) : 0

            return (
              <li key={p.id}>
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
                        pagadas === total && total > 0
                          ? 'bg-success-soft text-success'
                          : 'bg-warning-soft text-warning'
                      }`}
                    >
                      {pagadas === total && total > 0 ? 'Cancelado' : 'Activo'}
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
