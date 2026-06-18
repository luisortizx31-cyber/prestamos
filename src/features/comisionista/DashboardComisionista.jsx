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
        <div className="mb-4 flex justify-end">
          <Link
            to="/clientes/nuevo"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            + Nuevo cliente
          </Link>
        </div>

        {cargando && <p className="text-ink-soft">Cargando…</p>}

        {!cargando && clientes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-soft">
            Todavía no tienes clientes registrados.
          </div>
        )}

        <ul className="space-y-3">
          {clientes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4"
            >
              <div>
                <p className="font-medium text-ink">{c.nombre}</p>
                <p className="text-sm text-ink-soft">DNI {c.dni}</p>
              </div>
              <EtiquetaEstadoCliente estado={c.estado} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
