import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useAuth } from '../../context/AuthContext'
import { ModalCobro } from '../shared/ModalCobro'
import { ESTADO_CUOTA, METODO_PAGO, TIPO_CUOTA_LABELS } from '../../models/prestamo'

export default function ChecklistCuotas() {
  const { prestamoId } = useParams()
  const navigate = useNavigate()
  const { usuarioAuth } = useAuth()
  const [prestamo, setPrestamo] = useState(null)
  const [cuotas, setCuotas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cuotaActiva, setCuotaActiva] = useState(null)

  useEffect(() => {
    let unsub
    async function iniciar() {
      const snapPrestamo = await getDoc(doc(db, 'prestamos', prestamoId))
      if (snapPrestamo.exists()) {
        setPrestamo({ id: snapPrestamo.id, ...snapPrestamo.data() })
      }
      const q = query(
        collection(db, 'prestamos', prestamoId, 'cuotas'),
        orderBy('numero', 'asc')
      )
      unsub = onSnapshot(q, (snap) => {
        setCuotas(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setCargando(false)
      })
    }
    iniciar().catch(console.error)
    return () => unsub?.()
  }, [prestamoId])

  const pagadas = cuotas.filter((c) => c.estado === ESTADO_CUOTA.PAGADO).length
  const pendientes = cuotas.length - pagadas
  const progreso = cuotas.length > 0 ? Math.round((pagadas / cuotas.length) * 100) : 0

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Cargando...
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
              Cronograma de cobro
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
            <span>{pagadas} de {cuotas.length} cuotas cobradas</span>
            <span className="font-medium text-brand">{progreso}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-line overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${progreso}%` }}
            />
          </div>
          {pendientes > 0 && (
            <p className="text-xs text-ink-soft">
              {pendientes} cuota{pendientes > 1 ? 's' : ''} pendiente{pendientes > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-5">
        {cuotas.length === 0 && (
          <p className="text-center text-ink-soft py-10">No hay cuotas registradas.</p>
        )}
        <ul className="space-y-3">
          {cuotas.map((cuota) => {
            const pagada = cuota.estado === ESTADO_CUOTA.PAGADO
            const fechaVenc = cuota.fechaVencimiento?.toDate
              ? cuota.fechaVencimiento.toDate()
              : new Date(cuota.fechaVencimiento)
            const vencida = !pagada && fechaVenc < new Date()

            return (
              <li
                key={cuota.id}
                className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
                  pagada
                    ? 'border-success/30 bg-success-soft'
                    : vencida
                    ? 'border-danger/30 bg-danger-soft'
                    : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      pagada ? 'bg-success text-white'
                        : vencida ? 'bg-danger text-white'
                        : 'bg-line text-ink-soft'
                    }`}
                  >
                    {pagada ? '✓' : cuota.numero}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${
                      pagada ? 'text-success' : vencida ? 'text-danger' : 'text-ink'
                    }`}>
                      {formatFecha(fechaVenc)}
                      {vencida && <span className="ml-2 text-xs font-semibold">VENCIDA</span>}
                    </p>
                    {pagada && cuota.metodoPago === METODO_PAGO.YAPE && cuota.codigoYape && (
                      <p className="font-mono text-xs text-success/70 truncate">
                        Yape: {cuota.codigoYape}
                      </p>
                    )}
                    {pagada && cuota.metodoPago === METODO_PAGO.EFECTIVO && (
                      <p className="text-xs text-success/70">Efectivo</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="money text-base font-semibold text-ink">
                    S/ {cuota.monto.toFixed(2)}
                  </span>
                  {!pagada && (
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
