import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collectionGroup, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useAuth } from '../../context/AuthContext'
import { ModalCobro } from '../shared/ModalCobro'
import { ESTADO_CUOTA } from '../../models/prestamo'

export default function ChecklistDelDia() {
  const { usuarioAuth } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cuotaActiva, setCuotaActiva] = useState(null)

  useEffect(() => {
    if (!usuarioAuth) return
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioAuth])

  async function cargar() {
    setCargando(true)
    try {
      // Collection group query: busca en TODAS las subcolecciones
      // "cuotas" de TODOS los prestamos, filtrando solo por las del
      // comisionista logueado. El filtro comisionistaId == uid es lo
      // que permite que esta consulta pase las Security Rules de
      // "list" (Firestore verifica que el propio query garantice la
      // condicion de la regla).
      const q = query(
        collectionGroup(db, 'cuotas'),
        where('comisionistaId', '==', usuarioAuth.uid),
        where('estado', '==', ESTADO_CUOTA.PENDIENTE)
      )
      const snap = await getDocs(q)

      const finDeHoy = new Date()
      finDeHoy.setHours(23, 59, 59, 999)

      const cuotasDeHoy = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => {
          const fecha = c.fechaVencimiento?.toDate
            ? c.fechaVencimiento.toDate()
            : new Date(c.fechaVencimiento)
          return fecha <= finDeHoy
        })

      // Traer el nombre de cada cliente involucrado (una sola vez por
      // clienteId, no por cuota, para no repetir lecturas).
      const clienteIds = [...new Set(cuotasDeHoy.map((c) => c.clienteId).filter(Boolean))]
      const nombresPorCliente = {}
      await Promise.all(
        clienteIds.map(async (id) => {
          const snapCliente = await getDoc(doc(db, 'clientes', id))
          if (snapCliente.exists()) {
            nombresPorCliente[id] = snapCliente.data().nombre
          }
        })
      )

      const conNombre = cuotasDeHoy
        .map((c) => ({ ...c, clienteNombre: nombresPorCliente[c.clienteId] || 'Cliente' }))
        .sort((a, b) => {
          const fa = a.fechaVencimiento?.toDate ? a.fechaVencimiento.toDate() : new Date(a.fechaVencimiento)
          const fb = b.fechaVencimiento?.toDate ? b.fechaVencimiento.toDate() : new Date(b.fechaVencimiento)
          return fa - fb
        })

      setItems(conNombre)
    } catch (err) {
      console.error('[ChecklistDelDia]', err)
    } finally {
      setCargando(false)
    }
  }

  function onPagoExitoso() {
    setCuotaActiva(null)
    cargar() // recarga la lista: la cuota pagada desaparece sola
  }

  const totalACobrar = items.reduce((acc, c) => acc + (c.monto || 0), 0)
  const hoy = new Date()

  return (
    <div className="min-h-screen bg-paper pb-10">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <button onClick={() => navigate(-1)} className="text-xl leading-none text-ink-soft">
          ←
        </button>
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            {hoy.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="text-lg font-semibold text-ink">Checklist del dia</h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-5">
        {!cargando && items.length > 0 && (
          <div className="mb-5 rounded-2xl border border-brand/30 bg-brand-soft p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-brand">Por cobrar hoy</p>
              <p className="text-xs text-brand/70">{items.length} cuota{items.length > 1 ? 's' : ''}</p>
            </div>
            <p className="money text-2xl font-bold text-brand">S/ {totalACobrar.toFixed(2)}</p>
          </div>
        )}

        {cargando && <p className="text-center text-ink-soft py-10">Cargando...</p>}

        {!cargando && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-ink font-medium">No tienes cobros pendientes por hoy</p>
            <p className="text-sm text-ink-soft mt-1">Todo al dia.</p>
          </div>
        )}

        <ul className="space-y-3">
          {items.map((cuota) => {
            const fecha = cuota.fechaVencimiento?.toDate
              ? cuota.fechaVencimiento.toDate()
              : new Date(cuota.fechaVencimiento)
            const vencida = fecha < new Date(hoy.setHours(0, 0, 0, 0))

            return (
              <li
                key={cuota.id}
                className={`rounded-2xl border p-4 ${
                  vencida ? 'border-danger/30 bg-danger-soft' : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/clientes/${cuota.clienteId}`} className="min-w-0">
                    <p className="font-medium text-ink truncate">{cuota.clienteNombre}</p>
                    <p className={`text-xs ${vencida ? 'text-danger font-semibold' : 'text-ink-soft'}`}>
                      Cuota {cuota.numero} · {vencida ? 'VENCIDA' : 'Vence hoy'}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="money font-semibold text-ink">S/ {cuota.monto.toFixed(2)}</span>
                    <button
                      onClick={() => setCuotaActiva(cuota)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium text-white active:scale-95 transition-transform ${
                        vencida ? 'bg-danger' : 'bg-brand'
                      }`}
                    >
                      Cobrar
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {cuotaActiva && (
        <ModalCobro
          cuota={cuotaActiva}
          prestamoId={cuotaActiva.prestamoId}
          comisionistaId={usuarioAuth?.uid}
          clienteId={cuotaActiva.clienteId}
          onCerrar={onPagoExitoso}
        />
      )}
    </div>
  )
}
