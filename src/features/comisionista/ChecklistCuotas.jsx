import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { ModalCobro } from '../shared/ModalCobro'
import { BotonOfrecerRenovacion } from '../shared/BotonOfrecerRenovacion'
import { ESTADO_CUOTA, METODO_PAGO, TIPO_CUOTA_LABELS, ESTADO_SOLICITUD, solicitudEstaAprobada } from '../../models/prestamo'

export default function ChecklistCuotas() {
  const { prestamoId } = useParams()
  const navigate = useNavigate()
  const { usuarioAuth } = useAuth()
  const { esMaestro } = useRole()
  const [prestamo, setPrestamo] = useState(null)
  const [clienteNombre, setClienteNombre] = useState(null)
  const [cuotas, setCuotas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [cuotaActiva, setCuotaActiva] = useState(null)

  useEffect(() => {
    let unsub
    async function iniciar() {
      const snapPrestamo = await getDoc(doc(db, 'prestamos', prestamoId))
      if (snapPrestamo.exists()) {
        const datosPrestamo = { id: snapPrestamo.id, ...snapPrestamo.data() }
        setPrestamo(datosPrestamo)

        if (datosPrestamo.clienteId) {
          const snapCliente = await getDoc(doc(db, 'clientes', datosPrestamo.clienteId))
          if (snapCliente.exists()) {
            setClienteNombre(snapCliente.data().nombre)
          }
        }
      }
      const cuotasRef = collection(db, 'prestamos', prestamoId, 'cuotas')
      // IMPORTANTE: la regla de seguridad de /cuotas depende del campo
      // comisionistaId SOLO en la rama del comisionista. La rama del
      // Maestro (esMaestro()) no depende de ningun campo del documento,
      // asi que el Maestro puede leer SIN el filtro where(); si se lo
      // agregaramos igual, el resultado le saldria vacio (su propio uid
      // nunca es el comisionistaId de la cuota). El comisionista, en
      // cambio, SI necesita el filtro — sin el, Firestore rechaza la
      // consulta completa con "permission denied" (ver fix anterior).
      const q = esMaestro
        ? query(cuotasRef)
        : query(cuotasRef, where('comisionistaId', '==', usuarioAuth.uid))
      unsub = onSnapshot(
        q,
        (snap) => {
          // Ordenamos por numero en el cliente (no con orderBy en la
          // query) para no necesitar crear un indice compuesto en
          // Firestore solo para esta pantalla.
          const lista = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => a.numero - b.numero)
          setCuotas(lista)
          setCargando(false)
        },
        (err) => {
          // Si Firestore rechaza la suscripcion (ej. permisos), esto se
          // dispara DESPUES del subscribe inicial. Sin este callback la
          // pantalla se quedaria "cargando" para siempre sin avisar nada.
          console.error('[ChecklistCuotas] onSnapshot error:', err)
          setErrorCarga(
            err.code === 'permission-denied'
              ? 'No tienes permiso para ver este prestamo.'
              : 'Ocurrio un error al cargar las cuotas.'
          )
          setCargando(false)
        }
      )
    }
    iniciar().catch((err) => {
      // Mismo problema si el error ocurre en el getDoc inicial (antes de
      // siquiera llegar a suscribirse) — sin este catch con setCargando,
      // la pantalla quedaba congelada en el spinner para siempre.
      console.error('[ChecklistCuotas] Error al iniciar:', err)
      setErrorCarga(
        err.code === 'permission-denied'
          ? 'No tienes permiso para ver este prestamo.'
          : 'Ocurrio un error al cargar el prestamo.'
      )
      setCargando(false)
    })
    return () => unsub?.()
  }, [prestamoId, usuarioAuth?.uid, esMaestro])

  const pagadas = cuotas.filter((c) => c.estado === ESTADO_CUOTA.PAGADO).length
  const enRevision = cuotas.filter((c) => c.estado === ESTADO_CUOTA.POR_VERIFICAR).length
  const pendientes = cuotas.length - pagadas - enRevision
  const progreso = cuotas.length > 0 ? Math.round((pagadas / cuotas.length) * 100) : 0

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Cargando...
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-danger font-medium">{errorCarga}</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft"
        >
          ← Volver
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper pb-10">
      <header className="border-b border-line bg-surface px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="text-xl leading-none text-ink-soft">
            ←
          </button>
          <div>
            <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
              {clienteNombre || 'Cronograma de cobro'}
            </p>
            <h1 className="text-lg font-semibold text-ink">
              {prestamo ? `S/ ${(prestamo.montoPrestado || 0).toFixed(2)}` : '...'}
              {prestamo && (
                <span className="ml-2 text-sm font-normal text-ink-soft">
                  · {TIPO_CUOTA_LABELS[prestamo.tipoCuota]}
                </span>
              )}
            </h1>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-ink-soft">
            <span>{pagadas} de {cuotas.length} cuotas confirmadas</span>
            <span className="font-medium text-brand">{progreso}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-line overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${progreso}%` }}
            />
          </div>
          <div className="flex gap-3 text-xs text-ink-soft">
            {enRevision > 0 && (
              <span className="text-gold font-medium">{enRevision} por verificar</span>
            )}
            {pendientes > 0 && (
              <span>{pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {prestamo && !esMaestro && (
          <BotonOfrecerRenovacion prestamo={prestamo} clienteId={prestamo.clienteId} />
        )}
      </header>

      {prestamo?.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE && (
        <div className="mx-4 mt-4 rounded-2xl border-2 border-gold bg-gold-soft p-4">
          <p className="text-sm font-semibold text-gold">⏳ Pendiente de aprobacion</p>
          <p className="text-xs text-gold/80 mt-1">
            Este credito todavia no fue aprobado por el administrador. No
            puedes cobrar ninguna cuota hasta que lo apruebe.
          </p>
        </div>
      )}

      {prestamo?.estadoSolicitud === ESTADO_SOLICITUD.RECHAZADO && (
        <div className="mx-4 mt-4 rounded-2xl border-2 border-danger bg-danger-soft p-4">
          <p className="text-sm font-semibold text-danger">✕ Credito rechazado</p>
          {prestamo.motivoRechazoCredito && (
            <p className="text-xs text-danger/80 mt-1">
              Motivo: {prestamo.motivoRechazoCredito}
            </p>
          )}
        </div>
      )}

      <main className="mx-auto max-w-lg px-4 py-5">
        {cuotas.length === 0 && (
          <p className="text-center text-ink-soft py-10">No hay cuotas registradas.</p>
        )}
        <ul className="space-y-3">
          {cuotas.map((cuota) => {
            const pagada = cuota.estado === ESTADO_CUOTA.PAGADO
            const porVerificar = cuota.estado === ESTADO_CUOTA.POR_VERIFICAR
            const esPendiente = cuota.estado === ESTADO_CUOTA.PENDIENTE
            const fechaVenc = cuota.fechaVencimiento?.toDate
              ? cuota.fechaVencimiento.toDate()
              : new Date(cuota.fechaVencimiento)
            const vencida = esPendiente && fechaVenc < new Date()

            return (
              <li
                key={cuota.id}
                className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
                  pagada
                    ? 'border-success/30 bg-success-soft'
                    : porVerificar
                    ? 'border-gold/30 bg-gold-soft'
                    : vencida
                    ? 'border-danger/30 bg-danger-soft'
                    : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      pagada ? 'bg-success text-white'
                        : porVerificar ? 'bg-gold text-white'
                        : vencida ? 'bg-danger text-white'
                        : 'bg-line text-ink-soft'
                    }`}
                  >
                    {pagada ? '✓' : porVerificar ? '⏳' : cuota.numero}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${
                      pagada ? 'text-success' : porVerificar ? 'text-gold' : vencida ? 'text-danger' : 'text-ink'
                    }`}>
                      {formatFecha(fechaVenc)}
                      {vencida && <span className="ml-2 text-xs font-semibold">VENCIDA</span>}
                      {porVerificar && <span className="ml-2 text-xs font-semibold">EN REVISION</span>}
                    </p>
                    {(pagada || porVerificar) && cuota.metodoPago === METODO_PAGO.YAPE && cuota.codigoYape && (
                      <p className="font-mono text-xs opacity-70 truncate">
                        Yape: {cuota.codigoYape}
                      </p>
                    )}
                    {(pagada || porVerificar) && cuota.metodoPago === METODO_PAGO.EFECTIVO && (
                      <p className="text-xs opacity-70">Efectivo</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="money text-base font-semibold text-ink">
                    S/ {cuota.monto.toFixed(2)}
                  </span>
                  {esPendiente && !esMaestro && solicitudEstaAprobada(prestamo) && (
                    <button
                      onClick={() => setCuotaActiva(cuota)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium text-white active:scale-95 transition-transform ${
                        vencida ? 'bg-danger' : 'bg-brand'
                      }`}
                    >
                      Cobrar
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {prestamo?.montoSeguro > 0 && (
          <div className="mt-6 rounded-2xl border border-gold/30 bg-gold-soft p-4">
            <p className="text-sm text-gold font-medium">Seguro del prestamo</p>
            <p className="money text-xl font-bold text-gold">
              S/ {prestamo.montoSeguro.toFixed(2)}
            </p>
            <p className="text-xs text-gold/70 mt-0.5">Se cobra por separado al capital</p>
          </div>
        )}
      </main>

      {cuotaActiva && prestamo && (
        <ModalCobro
          cuota={cuotaActiva}
          prestamoId={prestamoId}
          comisionistaId={usuarioAuth?.uid}
          clienteId={prestamo.clienteId}
          onCerrar={() => setCuotaActiva(null)}
        />
      )}
    </div>
  )
}

function formatFecha(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
