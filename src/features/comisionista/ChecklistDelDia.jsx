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
  // Filtro por antigüedad de la mora, para no tener que leer cuota por
  // cuota cuales son las mas urgentes entre muchas vencidas.
  const [filtroMora, setFiltroMora] = useState('todos') // 'todos' | 'semana' | 'mes' | 'mas_mes'

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

  const totalACobrar = items.reduce(
    (acc, c) => acc + Math.max((c.monto || 0) - (c.montoPagado || 0), 0),
    0
  )
  const hoy = new Date()

  // Dias de atraso de cada cuota (0 si vence hoy, sin haber vencido
  // todavia) y en que balde de antigüedad cae, para el filtro de abajo.
  function diasVencido(cuota) {
    const fecha = cuota.fechaVencimiento?.toDate
      ? cuota.fechaVencimiento.toDate()
      : new Date(cuota.fechaVencimiento)
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    return Math.max(0, Math.round((inicioHoy - fecha) / (1000 * 60 * 60 * 24)))
  }
  function baldeMora(dias) {
    if (dias <= 0) return 'hoy'
    if (dias <= 7) return 'semana'
    if (dias <= 30) return 'mes'
    return 'mas_mes'
  }

  const itemsFiltrados =
    filtroMora === 'todos' ? items : items.filter((c) => baldeMora(diasVencido(c)) === filtroMora)

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

        {!cargando && items.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { valor: 'todos', label: 'Todos' },
              { valor: 'hoy', label: 'Vencen hoy' },
              { valor: 'semana', label: 'Vencidas ~7 dias' },
              { valor: 'mes', label: 'Vencidas +8 dias' },
              { valor: 'mas_mes', label: 'Vencidas +1 mes' },
            ].map(({ valor, label }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltroMora(valor)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filtroMora === valor
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-surface text-ink-soft'
                }`}
              >
                {label}
              </button>
            ))}
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

        {!cargando && items.length > 0 && itemsFiltrados.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            No hay ninguna cuota en ese rango de atraso.
          </div>
        )}

        <ul className="space-y-3">
          {itemsFiltrados.map((cuota) => {
            const dias = diasVencido(cuota)
            // Con un abono parcial ya registrado, no cuenta como vencida
            // aunque la fecha haya pasado — solo falta la diferencia.
            const tieneAbono = cuota.montoPagado > 0
            const vencida = dias > 0 && !tieneAbono
            const montoMostrar = tieneAbono ? cuota.monto - cuota.montoPagado : cuota.monto

            return (
              <li
                key={cuota.id}
                className={`rounded-2xl border p-4 ${
                  vencida
                    ? 'border-danger/30 bg-danger-soft'
                    : tieneAbono
                    ? 'border-brand/30 bg-brand-soft'
                    : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/clientes/${cuota.clienteId}`} className="min-w-0">
                    <p className="font-medium text-ink truncate">{cuota.clienteNombre}</p>
                    <p className={`text-xs ${vencida ? 'text-danger font-semibold' : 'text-ink-soft'}`}>
                      Cuota {cuota.numero} ·{' '}
                      {vencida ? `VENCIDA hace ${dias} dia${dias !== 1 ? 's' : ''}` : dias > 0 ? `Vencio hace ${dias} dia${dias !== 1 ? 's' : ''}` : 'Vence hoy'}
                    </p>
                    {tieneAbono && (
                      <p className="text-xs text-brand">Abonado S/ {cuota.montoPagado.toFixed(2)}</p>
                    )}
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="money font-semibold text-ink">S/ {montoMostrar.toFixed(2)}</span>
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
