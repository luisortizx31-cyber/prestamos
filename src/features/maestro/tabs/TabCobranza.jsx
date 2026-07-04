import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../../config/firebase'
import { EtiquetaEstadoCliente } from '../../shared/EtiquetaEstadoCliente'
import { BotonExportarExcel } from '../../shared/BotonExportarExcel'
import { ESTADO_CLIENTE_LABELS, ESTADO_CLIENTE_STYLES } from '../../../models/prestamo'
import { useAuth } from '../../../context/AuthContext'
import { reasignarCliente } from '../../../services/clientesService'
import { construirLinkWhatsapp } from '../../../utils/whatsapp'

function obtenerIniciales(nombre) {
  if (!nombre) return '?'
  const partes = nombre.trim().split(/\s+/)
  const iniciales = partes.length > 1
    ? partes[0][0] + partes[partes.length - 1][0]
    : partes[0].slice(0, 2)
  return iniciales.toUpperCase()
}

export default function TabCobranza() {
  const { usuarioAuth } = useAuth()
  const [clientes, setClientes] = useState([])
  const [comisionistas, setComisionistas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [expandidos, setExpandidos] = useState(new Set())

  // Reasignar clientes a mano: seleccion con checkbox + destino
  // (otro comisionista o el propio Maestro).
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [destino, setDestino] = useState('')
  const [moviendo, setMoviendo] = useState(false)
  const [errorMover, setErrorMover] = useState(null)
  const [resultadoMover, setResultadoMover] = useState(null)

  async function cargar() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const [snapClientes, snapComisionistas] = await Promise.all([
        getDocs(collection(db, 'clientes')),
        getDocs(query(collection(db, 'usuarios'), where('role', '==', 'collector'))),
      ])
      setClientes(snapClientes.docs.map((d) => ({ id: d.id, ...d.data() })))
      setComisionistas(snapComisionistas.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('[TabCobranza]', err)
      setErrorCarga(
        err.code === 'permission-denied'
          ? 'No tienes permiso para ver los clientes.'
          : 'Ocurrio un error al cargar los datos.'
      )
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  // Filtro en vivo por nombre o DNI (instantaneo, sobre los datos ya
  // cargados — no se vuelve a consultar Firestore en cada letra).
  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino) return clientes
    return clientes.filter(
      (c) =>
        c.nombre?.toLowerCase().includes(termino) ||
        c.dni?.includes(termino)
    )
  }, [clientes, busqueda])

  // Agrupar por comisionista
  const grupos = useMemo(() => {
    const mapa = {}
    comisionistas.forEach((c) => {
      mapa[c.id] = { nombre: c.nombre, clientes: [] }
    })
    clientesFiltrados.forEach((cl) => {
      if (!mapa[cl.comisionistaId]) {
        mapa[cl.comisionistaId] = {
          nombre: cl.comisionistaId === usuarioAuth?.uid ? 'Tu cartera (Maestro)' : 'Comisionista',
          clientes: [],
        }
      }
      mapa[cl.comisionistaId].clientes.push(cl)
    })
    // Si hay busqueda activa, solo mostramos comisionistas con
    // resultados (para no mostrar grupos vacios mientras se busca).
    return Object.entries(mapa).filter(
      ([, grupo]) => !busqueda.trim() || grupo.clientes.length > 0
    )
  }, [comisionistas, clientesFiltrados, busqueda, usuarioAuth])

  function toggleExpandido(comisionistaId) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      next.has(comisionistaId) ? next.delete(comisionistaId) : next.add(comisionistaId)
      return next
    })
  }

  function toggleSeleccionado(clienteId) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      next.has(clienteId) ? next.delete(clienteId) : next.add(clienteId)
      return next
    })
    setResultadoMover(null)
  }

  async function handleMover() {
    if (!destino || seleccionados.size === 0) return
    setMoviendo(true)
    setErrorMover(null)
    try {
      const destinoId = destino === 'MAESTRO' ? usuarioAuth.uid : destino
      for (const clienteId of seleccionados) {
        await reasignarCliente(clienteId, destinoId)
      }
      setResultadoMover(
        `${seleccionados.size} cliente${seleccionados.size !== 1 ? 's' : ''} movido${
          seleccionados.size !== 1 ? 's' : ''
        }.`
      )
      setSeleccionados(new Set())
      setDestino('')
      await cargar()
    } catch (err) {
      console.error('[TabCobranza] Error al reasignar:', err)
      setErrorMover('No se pudo mover a alguno de los clientes. Intenta de nuevo.')
    } finally {
      setMoviendo(false)
    }
  }

  if (cargando) {
    return <p className="text-center text-ink-soft py-10">Cargando...</p>
  }

  if (errorCarga) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger-soft p-5 text-center">
        <p className="text-danger font-medium">{errorCarga}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-brand p-4 text-white">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Cartera total</p>
          <p className="text-2xl font-bold">
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-white/70">
            {comisionistas.length} comisionista{comisionistas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span className="text-3xl">🗂️</span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-5">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o DNI..."
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-ink outline-none focus-visible:border-brand"
        />
        <BotonExportarExcel
          nombreArchivo="clientes_cobranza"
          nombreHoja="Clientes"
          label="Excel"
          columnas={[
            { header: 'Cliente', key: 'nombre', width: 25 },
            { header: 'DNI', key: 'dni', width: 14 },
            { header: 'Comisionista', key: 'comisionistaNombre', width: 25 },
            { header: 'Estado', key: 'estadoTexto', width: 18 },
          ]}
          filas={clientesFiltrados.map((c) => ({
            ...c,
            comisionistaNombre:
              comisionistas.find((com) => com.id === c.comisionistaId)?.nombre || 'Comisionista',
            estadoTexto: ESTADO_CLIENTE_LABELS[c.estado] || c.estado || '',
          }))}
        />
      </div>

      {/* Barra de reasignacion: aparece con al menos un cliente elegido */}
      {seleccionados.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand/30 bg-brand-soft p-3">
          <span className="text-sm font-medium text-ink">
            {seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}
          </span>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-brand"
          >
            <option value="">Mover a…</option>
            <option value="MAESTRO">Yo (Maestro)</option>
            {comisionistas
              .filter((c) => c.activo !== false)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
          <button
            onClick={handleMover}
            disabled={!destino || moviendo}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {moviendo ? 'Moviendo…' : 'Mover'}
          </button>
          <button
            onClick={() => {
              setSeleccionados(new Set())
              setDestino('')
            }}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft"
          >
            Cancelar
          </button>
        </div>
      )}

      {errorMover && <p className="mb-3 text-sm text-danger">{errorMover}</p>}
      {resultadoMover && <p className="mb-3 text-sm text-success">{resultadoMover}</p>}

      {grupos.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
          {busqueda
            ? 'Ningun cliente coincide con la busqueda.'
            : 'Todavia no hay comisionistas registrados.'}
        </div>
      )}

      <div className="space-y-3">
        {grupos.map(([comisionistaId, grupo]) => {
          // Con busqueda activa, los acordeones que coinciden se abren
          // solos para no obligar a hacer click extra.
          const abierto = busqueda.trim() ? true : expandidos.has(comisionistaId)

          return (
            <div
              key={comisionistaId}
              className="rounded-2xl border border-brand/30 bg-surface overflow-hidden shadow-sm"
            >
              {/* Cabecera del comisionista: fondo solido + avatar, para
                  que se distinga de un vistazo de los clientes que
                  cuelgan debajo (texto plano sobre fondo blanco). */}
              <button
                onClick={() => toggleExpandido(comisionistaId)}
                className="w-full flex items-center gap-3 bg-brand px-4 py-3.5 text-white active:bg-brand-dark transition-colors"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold uppercase">
                  {obtenerIniciales(grupo.nombre)}
                </span>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                    Comisionista
                  </p>
                  <p className="font-semibold truncate">{grupo.nombre}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
                  {grupo.clientes.length} cliente{grupo.clientes.length !== 1 ? 's' : ''}
                </span>
                <span className={`shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}>
                  ⌄
                </span>
              </button>

              {abierto && (
                <ul className="divide-y divide-line border-t border-line bg-paper">
                  {grupo.clientes.length === 0 && (
                    <li className="px-4 py-3 text-sm text-ink-soft">Sin clientes.</li>
                  )}
                  {grupo.clientes.map((cl) => (
                    <li key={cl.id}>
                      {/* Checkbox fuera del Link a proposito: un <a> no
                          debe contener otro control interactivo que
                          intercepte el click sin pelear con la
                          navegacion (mismo patron que en otras tabs). */}
                      <div
                        className={`flex items-center gap-2 border-l-4 py-2.5 pl-4 pr-4 ${
                          ESTADO_CLIENTE_STYLES[cl.estado]?.border || 'border-l-transparent'
                        } ${ESTADO_CLIENTE_STYLES[cl.estado]?.bg || ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionados.has(cl.id)}
                          onChange={() => toggleSeleccionado(cl.id)}
                          aria-label={`Seleccionar a ${cl.nombre}`}
                          className="h-4 w-4 shrink-0 accent-brand"
                        />
                        <Link
                          to={`/clientes/${cl.id}`}
                          className="flex flex-1 min-w-0 items-center gap-3 py-0.5 pl-2 active:opacity-70 transition-opacity"
                        >
                          <span className="shrink-0 text-ink-soft/60">👤</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{cl.nombre}</p>
                            <p className="text-xs text-ink-soft">DNI {cl.dni}</p>
                          </div>
                          <EtiquetaEstadoCliente estado={cl.estado} />
                        </Link>
                        {construirLinkWhatsapp(cl.telefono) && (
                          <a
                            href={construirLinkWhatsapp(cl.telefono)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Escribir a ${cl.nombre} por WhatsApp`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-success/30 bg-success-soft text-sm text-success active:scale-95 transition-transform"
                          >
                            💬
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
