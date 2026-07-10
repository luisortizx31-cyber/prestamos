import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { listarPrestamosPorCliente } from '../../services/prestamosService'
import { recalcularEstadoCliente } from '../../services/clienteEstadoService'
import { EtiquetaEstadoCliente } from '../shared/EtiquetaEstadoCliente'
import { BotonOfrecerRenovacion } from '../shared/BotonOfrecerRenovacion'
import { BotonEditarPrestamo } from '../shared/BotonEditarPrestamo'
import { ModalCobro } from '../shared/ModalCobro'
import { ModalRecalendarizar } from '../shared/ModalRecalendarizar'
import { ConfirmarClaveMaestro } from '../shared/ConfirmarClaveMaestro'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import {
  TIPO_CUOTA,
  TIPO_CUOTA_LABELS,
  ESTADO_SOLICITUD,
  ESTADO_CUOTA,
  METODO_PAGO,
  solicitudEstaAprobada,
} from '../../models/prestamo'
import {
  debeOfrecerRenovacion,
  obtenerPrestamosVigentes,
  MAX_PRESTAMOS_VIGENTES,
} from '../../utils/renovacion'
import { construirLinkWhatsapp } from '../../utils/whatsapp'

export default function DetalleCliente() {
  const { clienteId } = useParams()
  const navigate = useNavigate()
  const { esMaestro } = useRole()
  const { usuarioAuth } = useAuth()
  const [cliente, setCliente] = useState(null)
  const [prestamos, setPrestamos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [prestamoExpandido, setPrestamoExpandido] = useState(null)
  const [cuotaActiva, setCuotaActiva] = useState(null) // { cuota, prestamoId }
  const [recalendarizacionActiva, setRecalendarizacionActiva] = useState(null) // { cuota, prestamoId }
  // Cuando el Maestro cobra o recalendariza en un cliente que no es
  // suyo, primero se le pide reconfirmar su PIN (ver
  // ConfirmarClaveMaestro.jsx) — esto guarda la accion en espera.
  const [confirmacionPendiente, setConfirmacionPendiente] = useState(null) // { accion, cuota, prestamoId }
  // Las fotos del DNI no se cargan hasta que el usuario las pide -
  // evita gastar ancho de banda/lecturas de Storage en cada visita.
  const [verFotosDni, setVerFotosDni] = useState(false)

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

  // Auto-expande un préstamo vigente cuando carga la data (si hay dos,
  // alcanza con abrir el primero — el comisionista puede desplegar el
  // otro a mano).
  useEffect(() => {
    const [vigente] = obtenerPrestamosVigentes(prestamos)
    if (vigente) setPrestamoExpandido(vigente.id)
  }, [prestamos])

  if (cargando) return <Cargando />

  if (!cliente) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Cliente no encontrado.
      </div>
    )
  }

  // Un comisionista SIEMPRE es dueño de los clientes que ve (las
  // Security Rules ya se lo garantizan). El Maestro, en cambio, ve
  // TODOS los clientes — pero solo debe tener los controles de
  // "comisionista" (nuevo prestamo, editar, cobrar) en los que registro
  // el mismo desde "Mi Cartera", no en los de otros comisionistas.
  const esPropietario = cliente.comisionistaId === usuarioAuth?.uid

  // El Maestro puede cobrar o recalendarizar cuotas de CUALQUIER
  // cliente (no solo los suyos), pero si el cliente no es suyo primero
  // debe reconfirmar su PIN (ver ConfirmarClaveMaestro.jsx) antes de
  // abrir el modal correspondiente.
  function handleAccionCuota(accion, cuota, prestamoId) {
    if (esPropietario) {
      if (accion === 'cobrar') setCuotaActiva({ cuota, prestamoId })
      else setRecalendarizacionActiva({ cuota, prestamoId })
    } else {
      setConfirmacionPendiente({ accion, cuota, prestamoId })
    }
  }

  const totalPrestado = prestamos.reduce((acc, p) => acc + (p.montoPrestado || 0), 0)
  // Regla de negocio: hasta MAX_PRESTAMOS_VIGENTES (2) prestamos
  // vigentes a la vez. Al llegar al maximo, o mientras haya uno
  // pendiente de aprobacion, no se puede registrar uno nuevo e
  // independiente — solo renovar o recalendarizar los que ya tiene.
  const prestamosVigentes = obtenerPrestamosVigentes(prestamos)
  const tienePendiente = prestamosVigentes.some(
    (p) => p.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE
  )
  const puedeAgregarNuevo = !tienePendiente && prestamosVigentes.length < MAX_PRESTAMOS_VIGENTES
  const prestamosOrdenados = [...prestamos].sort((a, b) => {
    const fa = a.creadoEn?.toDate ? a.creadoEn.toDate() : new Date(a.creadoEn || 0)
    const fb = b.creadoEn?.toDate ? b.creadoEn.toDate() : new Date(b.creadoEn || 0)
    return fb - fa
  })

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <button onClick={() => navigate(-1)} className="shrink-0 text-xl leading-none text-ink-soft">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">Cliente</p>
          {/* Sin truncate: el nombre largo se parte en dos líneas */}
          <h1 className="text-lg font-semibold text-ink leading-tight break-words">
            {cliente.nombre}
          </h1>
        </div>
        <div className="shrink-0">
          <EtiquetaEstadoCliente estado={cliente.estado} />
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-5 space-y-5">
        {/* Datos personales */}
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
            {(cliente.dniFrenteUrl || cliente.dniReversoUrl) && (
              <div className="pt-2">
                {verFotosDni ? (
                  <div className="grid grid-cols-2 gap-3">
                    {cliente.dniFrenteUrl && (
                      <a href={cliente.dniFrenteUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={cliente.dniFrenteUrl}
                          alt="DNI frente"
                          className="aspect-[4/3] w-full rounded-lg border border-line object-cover"
                        />
                      </a>
                    )}
                    {cliente.dniReversoUrl && (
                      <a href={cliente.dniReversoUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={cliente.dniReversoUrl}
                          alt="DNI reverso"
                          className="aspect-[4/3] w-full rounded-lg border border-line object-cover"
                        />
                      </a>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVerFotosDni(true)}
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink active:scale-95 transition-transform"
                  >
                    Ver DNI
                  </button>
                )}
              </div>
            )}
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

        {/* Cabecera de préstamos */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Prestamos ({prestamos.length})</h2>
          {esPropietario && puedeAgregarNuevo && (
            <Link
              to={`/clientes/${clienteId}/prestamos/nuevo`}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              + Nuevo prestamo
            </Link>
          )}
        </div>

        {esPropietario && prestamosVigentes.length > 0 && (
          <p className="text-xs text-ink-soft -mt-2">
            {tienePendiente
              ? 'Tiene una solicitud pendiente de aprobacion. No se puede registrar otro prestamo.'
              : prestamosVigentes.length >= MAX_PRESTAMOS_VIGENTES
              ? `Ya tiene ${MAX_PRESTAMOS_VIGENTES} prestamos activos (el maximo). Solo puede renovar o recalendarizar los que ya tiene.`
              : prestamosVigentes.some(debeOfrecerRenovacion)
              ? 'Ya tiene un prestamo activo. Puede registrar otro nuevo, o renovar el actual (ver abajo).'
              : 'Ya tiene un prestamo activo. Puede registrar otro nuevo, o renovarlo cuando pague la primera cuota.'}
          </p>
        )}

        {prestamos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            Este cliente aun no tiene prestamos registrados.
          </div>
        )}

        <ul className="space-y-3">
          {prestamosOrdenados.map((p, index) => {
            const pagadas = p.cuotasPagadas || 0
            const total = p.totalCuotas || 0
            const progreso = total > 0 ? Math.round((pagadas / total) * 100) : 0
            const expandido = prestamoExpandido === p.id
            // Cada tarjeta alterna de color para que se note donde termina
            // un prestamo y empieza el siguiente (antes todos eran blancos
            // y el boton "Editar solicitud" parecia flotar entre dos).
            const puedeEditar =
              esPropietario &&
              (esMaestro
                ? !p.renovado && !(p.cuotasPagadas > 0)
                : p.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE)
            const puedeRenovar = esPropietario && debeOfrecerRenovacion(p)

            return (
              <li key={p.id} className={p.renovado ? 'opacity-60' : undefined}>
                <div
                  className={`rounded-2xl border overflow-hidden transition-all ${
                    expandido ? 'border-brand/30 ring-1 ring-brand/10' : 'border-line'
                  } ${index % 2 === 0 ? 'bg-surface' : 'bg-brand-soft'}`}
                >
                  {/* Header del préstamo: toca para expandir/colapsar */}
                  <button
                    onClick={() => setPrestamoExpandido(expandido ? null : p.id)}
                    className="w-full p-4 text-left active:bg-paper transition-colors"
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
                      <div className="flex items-center gap-2">
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
                        <span className="text-xs text-ink-soft">{expandido ? '▲' : '▼'}</span>
                      </div>
                    </div>

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
                        Seguro: <span className="money">S/ {p.montoSeguro.toFixed(2)}</span>
                      </p>
                    )}
                  </button>

                  {/* Cuotas expandidas en tiempo real */}
                  {expandido && (
                    <CuotasInline
                      prestamo={p}
                      comisionistaId={usuarioAuth?.uid}
                      esMaestro={esMaestro}
                      esPropietario={esPropietario}
                      onCobrar={(cuota) => handleAccionCuota('cobrar', cuota, p.id)}
                      onRecalendarizar={(cuota) => handleAccionCuota('recalendarizar', cuota, p.id)}
                    />
                  )}

                  {/* Acciones del prestamo: van dentro de la misma tarjeta
                      (con separador) para que quede claro a cual de los
                      prestamos pertenecen. */}
                  {(puedeEditar || puedeRenovar) && (
                    <div className="border-t border-line px-4 pb-4">
                      {puedeEditar && (
                        <BotonEditarPrestamo prestamo={p} clienteId={clienteId} esMaestro={esMaestro} />
                      )}
                      {puedeRenovar && <BotonOfrecerRenovacion prestamo={p} clienteId={clienteId} />}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {cuotaActiva && (
        <ModalCobro
          cuota={cuotaActiva.cuota}
          prestamoId={cuotaActiva.prestamoId}
          // El cobro siempre queda a nombre del comisionista DUEÑO del
          // cliente (aunque quien lo registre sea el Maestro cubriendolo)
          // — asi la comision y la visibilidad de sus propias cuotas no
          // se le rompen al comisionista original. Para sus propios
          // clientes esto es lo mismo que usuarioAuth.uid de todos modos.
          comisionistaId={cliente.comisionistaId}
          clienteId={clienteId}
          onCerrar={() => setCuotaActiva(null)}
        />
      )}

      {recalendarizacionActiva && (
        <ModalRecalendarizar
          prestamo={prestamos.find((p) => p.id === recalendarizacionActiva.prestamoId)}
          prestamoId={recalendarizacionActiva.prestamoId}
          comisionistaId={cliente.comisionistaId}
          clienteId={clienteId}
          onCerrar={() => setRecalendarizacionActiva(null)}
        />
      )}

      {confirmacionPendiente && (
        <ConfirmarClaveMaestro
          onConfirmar={() => {
            if (confirmacionPendiente.accion === 'cobrar') {
              setCuotaActiva(confirmacionPendiente)
            } else {
              setRecalendarizacionActiva(confirmacionPendiente)
            }
            setConfirmacionPendiente(null)
          }}
          onCancelar={() => setConfirmacionPendiente(null)}
        />
      )}
    </div>
  )
}

// Cuotas en tiempo real dentro de la tarjeta del préstamo
function CuotasInline({ prestamo, comisionistaId, esMaestro, esPropietario, onCobrar, onRecalendarizar }) {
  const [cuotas, setCuotas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const ref = collection(db, 'prestamos', prestamo.id, 'cuotas')
    const q = esMaestro
      ? query(ref)
      : query(ref, where('comisionistaId', '==', comisionistaId))

    const unsub = onSnapshot(
      q,
      (snap) => {
        setCuotas(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => a.numero - b.numero)
        )
        setCargando(false)
      },
      (err) => {
        console.error('[CuotasInline]', err)
        setError('No se pudieron cargar las cuotas.')
        setCargando(false)
      }
    )
    return () => unsub()
  }, [prestamo.id, comisionistaId, esMaestro])

  if (cargando) {
    return (
      <div className="border-t border-line px-4 py-3 text-sm text-ink-soft">
        Cargando cuotas...
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-t border-line px-4 py-3 text-sm text-danger">{error}</div>
    )
  }

  return (
    <div className="border-t border-line">
      {/* Alertas del estado del préstamo */}
      {prestamo.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE && (
        <div className="mx-4 mt-3 rounded-xl border border-gold/30 bg-gold-soft px-3 py-2">
          <p className="text-xs font-semibold text-gold">
            ⏳ Pendiente de aprobacion del maestro
          </p>
        </div>
      )}
      {prestamo.estadoSolicitud === ESTADO_SOLICITUD.RECHAZADO && (
        <div className="mx-4 mt-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2">
          <p className="text-xs font-semibold text-danger">✕ Credito rechazado</p>
          {prestamo.motivoRechazoCredito && (
            <p className="mt-0.5 text-xs text-danger/80">
              Motivo: {prestamo.motivoRechazoCredito}
            </p>
          )}
        </div>
      )}
      {prestamo.renovado && (
        <div className="mx-4 mt-3 rounded-xl border border-line bg-paper px-3 py-2">
          <p className="text-xs font-semibold text-ink-soft">
            ⭐ Prestamo renovado — las cuotas pendientes se fusionaron en el prestamo nuevo.
          </p>
        </div>
      )}

      <ul className="space-y-1.5 p-4 pt-3">
        {(() => {
          // Solo tiene sentido recalendarizar la cuota pendiente mas
          // antigua (la "actual") — y solo si el tipo de cuota admite
          // correrse un periodo (no aplica a fecha_especifica, que es
          // pago unico).
          const primeraPendiente = cuotas.find((c) => c.estado === ESTADO_CUOTA.PENDIENTE)
          const admiteRecalendarizar = prestamo.tipoCuota !== TIPO_CUOTA.FECHA_ESPECIFICA

          return cuotas.map((cuota) => {
          const pagada = cuota.estado === ESTADO_CUOTA.PAGADO
          const porVerificar = cuota.estado === ESTADO_CUOTA.POR_VERIFICAR
          const esPendiente = cuota.estado === ESTADO_CUOTA.PENDIENTE
          const esLaActual = esPendiente && primeraPendiente?.id === cuota.id
          const fechaVenc = cuota.fechaVencimiento?.toDate
            ? cuota.fechaVencimiento.toDate()
            : new Date(cuota.fechaVencimiento)
          const vencida = esPendiente && fechaVenc < new Date()

          return (
            <li
              key={cuota.id}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${
                pagada
                  ? 'bg-success-soft'
                  : porVerificar
                  ? 'bg-gold-soft'
                  : vencida
                  ? 'bg-danger-soft'
                  : 'bg-paper'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    pagada
                      ? 'bg-success text-white'
                      : porVerificar
                      ? 'bg-gold text-white'
                      : vencida
                      ? 'bg-danger text-white'
                      : 'bg-line text-ink-soft'
                  }`}
                >
                  {pagada ? '✓' : porVerificar ? '⏳' : cuota.numero}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-medium ${
                      pagada
                        ? 'text-success'
                        : porVerificar
                        ? 'text-gold'
                        : vencida
                        ? 'text-danger'
                        : 'text-ink'
                    }`}
                  >
                    {formatFecha(fechaVenc)}
                    {vencida && <span className="ml-1 font-bold">· VENCIDA</span>}
                    {porVerificar && <span className="ml-1">· EN REVISION</span>}
                    {cuota.recalendarizada && (
                      <span className="ml-1 text-ink-soft">· ↻ PUESTA AL DIA</span>
                    )}
                    {cuota.recalendarizacionPendiente && (
                      <span className="ml-1 text-gold">· 🕐 RECALENDARIZACION EN REVISION</span>
                    )}
                  </p>
                  {(pagada || porVerificar) &&
                    cuota.metodoPago === METODO_PAGO.YAPE &&
                    cuota.codigoYape && (
                      <p className="font-mono text-xs opacity-60 truncate">
                        Yape: {cuota.codigoYape}
                      </p>
                    )}
                  {(pagada || porVerificar) &&
                    cuota.metodoPago === METODO_PAGO.EFECTIVO && (
                      <p className="text-xs opacity-60">Efectivo</p>
                    )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="money text-sm font-semibold text-ink">
                  S/ {cuota.monto.toFixed(2)}
                </span>
                {esPendiente &&
                  !cuota.recalendarizacionPendiente &&
                  (esPropietario || esMaestro) &&
                  !prestamo.renovado &&
                  solicitudEstaAprobada(prestamo) && (
                    <button
                      onClick={() => onCobrar(cuota)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform ${
                        vencida ? 'bg-danger' : 'bg-brand'
                      }`}
                    >
                      Cobrar
                    </button>
                  )}
                {esLaActual &&
                  !cuota.recalendarizacionPendiente &&
                  admiteRecalendarizar &&
                  (esPropietario || esMaestro) &&
                  !prestamo.renovado &&
                  solicitudEstaAprobada(prestamo) && (
                    <button
                      onClick={() => onRecalendarizar(cuota)}
                      title="El cliente paga solo el interes y todas las cuotas pendientes se corren un periodo"
                      className="rounded-lg border border-gold/40 bg-gold-soft px-2.5 py-1.5 text-xs font-semibold text-gold active:scale-95 transition-transform"
                    >
                      ↻
                    </button>
                  )}
              </div>
            </li>
          )
          })
        })()}
      </ul>
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

function formatFecha(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
