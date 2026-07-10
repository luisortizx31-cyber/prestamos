import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collectionGroup, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { aprobarCuota, rechazarCuota, aprobarCuotasEnLote } from '../../services/conciliacionService'
import {
  aprobarRecalendarizacion,
  rechazarRecalendarizacion,
} from '../../services/recalendarizacionService'
import { METODO_PAGO, ESTADO_SOLICITUD } from '../../models/prestamo'

export default function ConciliacionCaja() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [recalendarizaciones, setRecalendarizaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [seleccionadas, setSeleccionadas] = useState(new Set())
  const [procesando, setProcesando] = useState(false)
  const [rechazando, setRechazando] = useState(null) // cuotaId en proceso de rechazo
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [procesandoRecal, setProcesandoRecal] = useState(null) // id de la recalendarizacion en proceso
  const [rechazandoRecal, setRechazandoRecal] = useState(null)
  const [motivoRechazoRecal, setMotivoRechazoRecal] = useState('')

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const [snapCuotas, snapRecal] = await Promise.all([
        getDocs(query(collectionGroup(db, 'cuotas'), where('estado', '==', 'por_verificar'))),
        getDocs(
          query(collection(db, 'recalendarizaciones'), where('estado', '==', ESTADO_SOLICITUD.PENDIENTE))
        ),
      ])
      const cuotas = snapCuotas.docs.map((d) => ({ id: d.id, ...d.data() }))
      const recalItems = snapRecal.docs.map((d) => ({ id: d.id, ...d.data() }))

      // Traemos nombre del comisionista y del cliente de cada cuota y
      // cada recalendarizacion (una sola lectura por id distinto, no
      // por item).
      const comisionistaIds = [
        ...new Set([...cuotas, ...recalItems].map((c) => c.comisionistaId).filter(Boolean)),
      ]
      const clienteIds = [
        ...new Set([...cuotas, ...recalItems].map((c) => c.clienteId).filter(Boolean)),
      ]

      const [nombresComisionista, nombresCliente] = await Promise.all([
        cargarNombres('usuarios', comisionistaIds),
        cargarNombres('clientes', clienteIds),
      ])

      const conNombres = cuotas
        .map((c) => ({
          ...c,
          comisionistaNombre: nombresComisionista[c.comisionistaId] || 'Comisionista',
          clienteNombre: nombresCliente[c.clienteId] || 'Cliente',
        }))
        .sort((a, b) => {
          const fa = a.fechaPago?.toDate ? a.fechaPago.toDate() : new Date(a.fechaPago)
          const fb = b.fechaPago?.toDate ? b.fechaPago.toDate() : new Date(b.fechaPago)
          return fa - fb
        })

      setItems(conNombres)
      setSeleccionadas(new Set())
      setRecalendarizaciones(
        recalItems.map((r) => ({
          ...r,
          comisionistaNombre: nombresComisionista[r.comisionistaId] || 'Comisionista',
          clienteNombre: nombresCliente[r.clienteId] || 'Cliente',
        }))
      )
    } catch (err) {
      console.error('[ConciliacionCaja]', err)
      setErrorCarga(
        err.code === 'permission-denied'
          ? 'No tienes permiso para ver los cobros pendientes. Revisa que tu cuenta tenga el rol "master".'
          : `Error al cargar: ${err.message || err.code || 'desconocido'}`
      )
    } finally {
      setCargando(false)
    }
  }

  async function cargarNombres(coleccion, ids) {
    const mapa = {}
    await Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, coleccion, id))
        if (snap.exists()) mapa[id] = snap.data().nombre
      })
    )
    return mapa
  }

  // Agrupar por comisionista para mostrar en bloques (base para la
  // "liquidacion parcial": seleccionar varias cuotas de un mismo
  // comisionista y aprobarlas juntas).
  const grupos = items.reduce((acc, item) => {
    const key = item.comisionistaId
    if (!acc[key]) acc[key] = { nombre: item.comisionistaNombre, items: [] }
    acc[key].items.push(item)
    return acc
  }, {})

  function toggleSeleccion(cuotaId) {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      next.has(cuotaId) ? next.delete(cuotaId) : next.add(cuotaId)
      return next
    })
  }

  function seleccionarTodoDeGrupo(grupoItems) {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      const todasSeleccionadas = grupoItems.every((i) => next.has(i.id))
      grupoItems.forEach((i) => (todasSeleccionadas ? next.delete(i.id) : next.add(i.id)))
      return next
    })
  }

  async function aprobarSeleccionadas() {
    const aAprobar = items.filter((i) => seleccionadas.has(i.id))
    if (aAprobar.length === 0) return
    setProcesando(true)
    try {
      await aprobarCuotasEnLote(
        aAprobar.map((i) => ({
          prestamoId: i.prestamoId,
          cuotaId: i.id,
          clienteId: i.clienteId,
        }))
      )
      await cargar()
    } catch (err) {
      console.error('[ConciliacionCaja] aprobarSeleccionadas', err)
    } finally {
      setProcesando(false)
    }
  }

  async function handleAprobarUna(item) {
    setProcesando(true)
    try {
      await aprobarCuota({ prestamoId: item.prestamoId, cuotaId: item.id, clienteId: item.clienteId })
      await cargar()
    } catch (err) {
      console.error('[ConciliacionCaja] handleAprobarUna', err)
    } finally {
      setProcesando(false)
    }
  }

  async function confirmarRechazo(item) {
    setProcesando(true)
    try {
      await rechazarCuota({
        prestamoId: item.prestamoId,
        cuotaId: item.id,
        motivo: motivoRechazo.trim(),
      })
      setRechazando(null)
      setMotivoRechazo('')
      await cargar()
    } catch (err) {
      console.error('[ConciliacionCaja] confirmarRechazo', err)
    } finally {
      setProcesando(false)
    }
  }

  async function handleAprobarRecal(item) {
    setProcesandoRecal(item.id)
    try {
      await aprobarRecalendarizacion(item.id)
      await cargar()
    } catch (err) {
      console.error('[ConciliacionCaja] handleAprobarRecal', err)
    } finally {
      setProcesandoRecal(null)
    }
  }

  async function confirmarRechazoRecal(item) {
    setProcesandoRecal(item.id)
    try {
      await rechazarRecalendarizacion(item.id, motivoRechazoRecal.trim())
      setRechazandoRecal(null)
      setMotivoRechazoRecal('')
      await cargar()
    } catch (err) {
      console.error('[ConciliacionCaja] confirmarRechazoRecal', err)
    } finally {
      setProcesandoRecal(null)
    }
  }

  return (
    <div className="min-h-screen bg-paper pb-24">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <button
          onClick={() => {
            // window.history.state.idx > 0 significa que esta pestaña
            // realmente tiene una pagina anterior a la que volver. Al
            // abrir esta pantalla desde una notificacion push (ver
            // notificationclick en src/sw.js), no hay historial previo
            // en esa ventana nueva — navigate(-1) ahi no hacia nada.
            if (window.history.state?.idx > 0) navigate(-1)
            else navigate('/')
          }}
          className="text-xl leading-none text-ink-soft"
        >
          ←
        </button>
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Conciliacion de caja
          </p>
          <h1 className="text-lg font-semibold text-ink">Cobros por verificar</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-5">
        {cargando && <p className="text-center text-ink-soft py-10">Cargando...</p>}

        {!cargando && errorCarga && (
          <div className="rounded-2xl border border-danger/30 bg-danger-soft p-5 text-center">
            <p className="text-danger font-medium">{errorCarga}</p>
          </div>
        )}

        {!cargando && !errorCarga && recalendarizaciones.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 px-1 font-semibold text-ink">
              ↻ Recalendarizaciones pendientes ({recalendarizaciones.length})
            </h2>
            <ul className="space-y-2">
              {recalendarizaciones.map((r) => (
                <li key={r.id} className="rounded-2xl border border-gold/30 bg-gold-soft/40 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">{r.clienteNombre}</p>
                    <span className="money font-semibold text-gold">
                      S/ {r.montoInteresPagado.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Comisionista: {r.comisionistaNombre} ·{' '}
                    {r.metodoPago === METODO_PAGO.YAPE ? `Yape: ${r.codigoYape}` : 'Efectivo'}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Solo interes — si se aprueba, todas las cuotas pendientes de
                    este prestamo se corren un periodo mas adelante.
                  </p>

                  {rechazandoRecal === r.id ? (
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        autoFocus
                        value={motivoRechazoRecal}
                        onChange={(e) => setMotivoRechazoRecal(e.target.value)}
                        placeholder="Motivo del rechazo (opcional)"
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:border-brand"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRechazandoRecal(null); setMotivoRechazoRecal('') }}
                          className="flex-1 rounded-lg border border-line py-2 text-sm text-ink-soft"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => confirmarRechazoRecal(r)}
                          disabled={procesandoRecal === r.id}
                          className="flex-1 rounded-lg bg-danger py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Confirmar rechazo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setRechazandoRecal(r.id)}
                        disabled={procesandoRecal === r.id}
                        className="flex-1 rounded-lg border border-danger/30 bg-danger-soft py-2 text-sm font-medium text-danger disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                      <button
                        onClick={() => handleAprobarRecal(r)}
                        disabled={procesandoRecal === r.id}
                        className="flex-1 rounded-lg bg-success py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {procesandoRecal === r.id ? 'Procesando...' : 'Aprobar'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!cargando && !errorCarga && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-ink font-medium">No hay cobros pendientes de verificar</p>
          </div>
        )}

        {Object.entries(grupos).map(([comisionistaId, grupo]) => {
          const totalGrupo = grupo.items.reduce((acc, i) => acc + i.monto, 0)
          const todasSeleccionadas = grupo.items.every((i) => seleccionadas.has(i.id))

          return (
            <section key={comisionistaId} className="mb-6">
              <div className="flex items-center justify-between mb-2 px-1">
                <div>
                  <p className="font-semibold text-ink">{grupo.nombre}</p>
                  <p className="text-xs text-ink-soft">
                    {grupo.items.length} cobro{grupo.items.length > 1 ? 's' : ''} ·{' '}
                    <span className="money">S/ {totalGrupo.toFixed(2)}</span>
                  </p>
                </div>
                <button
                  onClick={() => seleccionarTodoDeGrupo(grupo.items)}
                  className="text-xs font-medium text-brand"
                >
                  {todasSeleccionadas ? 'Quitar todos' : 'Seleccionar todos'}
                </button>
              </div>

              <ul className="space-y-2">
                {grupo.items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-line bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={seleccionadas.has(item.id)}
                        onChange={() => toggleSeleccion(item.id)}
                        className="mt-1 h-5 w-5 accent-brand"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-ink truncate">{item.clienteNombre}</p>
                          <span className="money font-semibold text-ink">
                            S/ {item.monto.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-ink-soft mt-0.5">
                          Cuota {item.numero} ·{' '}
                          {item.metodoPago === METODO_PAGO.YAPE
                            ? `Yape: ${item.codigoYape}`
                            : 'Efectivo'}
                          {' · '}
                          {formatFecha(item.fechaPago)}
                        </p>

                        {rechazando === item.id ? (
                          <div className="mt-3 space-y-2">
                            <input
                              type="text"
                              autoFocus
                              value={motivoRechazo}
                              onChange={(e) => setMotivoRechazo(e.target.value)}
                              placeholder="Motivo del rechazo (opcional)"
                              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:border-brand"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setRechazando(null); setMotivoRechazo('') }}
                                className="flex-1 rounded-lg border border-line py-2 text-sm text-ink-soft"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => confirmarRechazo(item)}
                                disabled={procesando}
                                className="flex-1 rounded-lg bg-danger py-2 text-sm font-medium text-white disabled:opacity-50"
                              >
                                Confirmar rechazo
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => setRechazando(item.id)}
                              disabled={procesando}
                              className="flex-1 rounded-lg border border-danger/30 bg-danger-soft py-2 text-sm font-medium text-danger disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                            <button
                              onClick={() => handleAprobarUna(item)}
                              disabled={procesando}
                              className="flex-1 rounded-lg bg-success py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                              Aprobar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {/* Barra flotante de liquidacion parcial */}
      {seleccionadas.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-line bg-surface p-4 shadow-lg">
          <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              {seleccionadas.size} cobro{seleccionadas.size > 1 ? 's' : ''} seleccionado{seleccionadas.size > 1 ? 's' : ''}
            </p>
            <button
              onClick={aprobarSeleccionadas}
              disabled={procesando}
              className="rounded-xl bg-success px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {procesando ? 'Procesando...' : `Aprobar seleccionados (${seleccionadas.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatFecha(fecha) {
  if (!fecha) return '—'
  const d = fecha?.toDate ? fecha.toDate() : new Date(fecha)
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}
