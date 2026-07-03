import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarClientesPorComisionista } from '../../../services/clientesService'
import { useAuth } from '../../../context/AuthContext'
import { EtiquetaEstadoCliente } from '../../shared/EtiquetaEstadoCliente'

/**
 * El Maestro puede actuar como su propio comisionista: registrar
 * clientes y prestamos directo, sin pasar por la aprobacion de
 * "Solicitudes" (ver RegistroPrestamo.jsx, autoAprobar). Esta pestaña
 * es su "cartera propia" — el resto de clientes (de otros
 * comisionistas) se siguen viendo, de solo lectura, en la pestaña
 * "Clientes".
 */
export default function TabMiCartera() {
  const { usuarioAuth } = useAuth()
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  async function cargar() {
    if (!usuarioAuth?.uid) return
    setCargando(true)
    setError(null)
    try {
      const data = await listarClientesPorComisionista(usuarioAuth.uid)
      setClientes(data)
    } catch (err) {
      console.error('[TabMiCartera]', err)
      setError('No se pudieron cargar tus clientes.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [usuarioAuth?.uid])

  const filtrados = clientes.filter((c) => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return c.nombre?.toLowerCase().includes(q) || c.dni?.includes(q)
  })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Mi cartera propia ({clientes.length})</h2>
        <Link
          to="/clientes/nuevo"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          + Nuevo cliente
        </Link>
      </div>

      <p className="mb-4 text-xs text-ink-soft">
        Aqui puedes registrar clientes y prestamos como si fueras un
        comisionista mas. Tus prestamos quedan aprobados automaticamente
        (no pasan por la pestaña "Solicitudes").
      </p>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o DNI…"
        className="mb-4 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 outline-none focus-visible:border-brand"
      />

      {cargando && <p className="text-ink-soft">Cargando…</p>}
      {error && <p className="text-danger">{error}</p>}

      {!cargando && !error && clientes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-soft">
          Todavia no registraste ningun cliente propio.
        </div>
      )}

      {!cargando && !error && clientes.length > 0 && filtrados.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-soft">
          No se encontro ningun cliente con "{busqueda}".
        </div>
      )}

      <ul className="space-y-3">
        {filtrados.map((c) => (
          <li key={c.id}>
            <Link
              to={`/clientes/${c.id}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 active:bg-paper transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">{c.nombre}</p>
                <p className="text-sm text-ink-soft">DNI {c.dni}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <EtiquetaEstadoCliente estado={c.estado} />
                <span className="text-ink-soft text-lg">›</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
