import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { listarClientesPorComisionista } from '../../services/clientesService'
import { logout } from '../../services/authService'
import { EtiquetaEstadoCliente } from '../shared/EtiquetaEstadoCliente'

export default function DashboardComisionista() {
  const { usuarioAuth, perfil } = useAuth()
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!usuarioAuth) return
    listarClientesPorComisionista(usuarioAuth.uid)
      .then(setClientes)
      .catch(console.error)
      .finally(() => setCargando(false))
  }, [usuarioAuth])

  return (
    <div className="min-h-screen bg-paper pb-10">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Comisionista
          </p>
          <h1 className="text-lg font-semibold text-ink">{perfil?.nombre}</h1>
        </div>
        <button
          onClick={() => logout()}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft"
        >
          Salir
        </button>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link
          to="/checklist-dia"
          className="mb-5 flex items-center justify-between rounded-2xl bg-brand p-4 text-white active:scale-[0.99] transition-transform"
        >
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70">Tu dia</p>
            <p className="font-semibold">Ver checklist del dia</p>
          </div>
          <span className="text-xl">→</span>
        </Link>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-ink-soft">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</p>
          <Link
            to="/clientes/nuevo"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            + Nuevo cliente
          </Link>
        </div>

        {cargando && <p className="text-ink-soft">Cargando...</p>}

        {!cargando && clientes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
            <p className="text-lg mb-1">Sin clientes aun</p>
            <p className="text-sm">Toca "+ Nuevo cliente" para registrar el primero.</p>
          </div>
        )}

        <ul className="space-y-3">
          {clientes.map((c) => (
            <li key={c.id}>
              <Link
                to={`/clientes/${c.id}`}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 active:bg-paper transition-colors"
              >
                <div>
                  <p className="font-medium text-ink">{c.nombre}</p>
                  <p className="text-sm text-ink-soft">DNI {c.dni}</p>
                </div>
                <div className="flex items-center gap-2">
                  <EtiquetaEstadoCliente estado={c.estado} />
                  <span className="text-ink-soft text-lg">›</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
