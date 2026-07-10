import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { listarClientesPorComisionista } from '../../services/clientesService'
import { listarPrestamosPorComisionista } from '../../services/prestamosService'
import { logout } from '../../services/authService'
import { EtiquetaEstadoCliente } from '../shared/EtiquetaEstadoCliente'
import { construirLinkWhatsapp } from '../../utils/whatsapp'
import { solicitudEstaAprobada, ESTADO_CLIENTE_STYLES, ESTADO_SOLICITUD } from '../../models/prestamo'

export default function DashboardComisionista() {
  const { usuarioAuth, perfil } = useAuth()
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [totalPrestado, setTotalPrestado] = useState(0)
  const [cargando, setCargando] = useState(true)
  // Clientes con al menos una solicitud pendiente de aprobacion del
  // Maestro — se les marca un punto parpadeante en la lista para que el
  // comisionista note de un vistazo cuales tiene que revisar, sin entrar
  // uno por uno.
  const [clientesConPendiente, setClientesConPendiente] = useState(new Set())

  useEffect(() => {
    if (!usuarioAuth) return
    Promise.all([
      listarClientesPorComisionista(usuarioAuth.uid),
      listarPrestamosPorComisionista(usuarioAuth.uid),
    ])
      .then(([listaClientes, listaPrestamos]) => {
        // Mas nuevo primero: sin esto Firestore los devuelve en un orden
        // que no tiene relacion con cuando se registraron, y un cliente
        // recien agregado podia quedar perdido varias pantallas abajo
        // justo cuando el comisionista lo necesita a mano para
        // registrarle el prestamo.
        const ordenados = [...listaClientes].sort((a, b) => {
          const fa = a.creadoEn?.toDate ? a.creadoEn.toDate() : new Date(a.creadoEn || 0)
          const fb = b.creadoEn?.toDate ? b.creadoEn.toDate() : new Date(b.creadoEn || 0)
          return fb - fa
        })
        setClientes(ordenados)
        // Solo cuenta lo realmente desembolsado: excluye solicitudes
        // pendientes/rechazadas (ver solicitudEstaAprobada en models/prestamo.js).
        const total = listaPrestamos
          .filter(solicitudEstaAprobada)
          .reduce((acc, p) => acc + (p.montoPrestado || 0), 0)
        setTotalPrestado(total)
        setClientesConPendiente(
          new Set(
            listaPrestamos
              .filter((p) => p.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE)
              .map((p) => p.clienteId)
          )
        )
      })
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
        <div className="flex items-center gap-2">
          <Link
            to="/cambiar-pin"
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft"
          >
            Cambiar PIN
          </Link>
          <button
            onClick={() => logout()}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft"
          >
            Salir
          </button>
        </div>
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

        {!cargando && (
          <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Monto total prestado</p>
            <p className="money text-2xl font-bold text-brand">S/ {totalPrestado.toFixed(2)}</p>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-ink-soft">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</p>
          <Link
            to="/clientes/nuevo"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            + Nuevo cliente
          </Link>
        </div>

        {!cargando && clientes.length > 0 && (
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o DNI…"
            className="mb-4 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 outline-none focus-visible:border-brand"
          />
        )}

        {cargando && <p className="text-ink-soft">Cargando...</p>}

        {!cargando && clientes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
            <p className="text-lg mb-1">Sin clientes aun</p>
            <p className="text-sm">Toca "+ Nuevo cliente" para registrar el primero.</p>
          </div>
        )}

        {!cargando && busqueda && clientes.filter(c =>
          c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || c.dni?.includes(busqueda)
        ).length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            No se encontro ningun cliente con "{busqueda}".
          </div>
        )}

        <ul className="space-y-3">
          {clientes.filter((c) => {
            const q = busqueda.trim().toLowerCase()
            if (!q) return true
            return c.nombre?.toLowerCase().includes(q) || c.dni?.includes(q)
          }).map((c) => {
            const linkWhatsapp = construirLinkWhatsapp(c.telefono)

            return (
              <li key={c.id} className="flex items-center gap-2">
                <Link
                  to={`/clientes/${c.id}`}
                  className={`flex flex-1 min-w-0 items-center justify-between rounded-2xl border border-line border-l-4 p-4 active:bg-paper transition-colors ${
                    ESTADO_CLIENTE_STYLES[c.estado]?.border || ''
                  } ${ESTADO_CLIENTE_STYLES[c.estado]?.bg || 'bg-surface'}`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 min-w-0 font-medium text-ink">
                      {clientesConPendiente.has(c.id) && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-gold animate-pulse"
                          title="Tiene una solicitud pendiente de aprobacion"
                        />
                      )}
                      <span className="truncate">{c.nombre}</span>
                    </p>
                    <p className="text-sm text-ink-soft">DNI {c.dni}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <EtiquetaEstadoCliente estado={c.estado} />
                    <span className="text-ink-soft text-lg">›</span>
                  </div>
                </Link>
                {/* Fuera del Link a proposito: un <a> no puede contener
                    otro <a> (mismo patron que BotonOfrecerRenovacion en
                    DetalleCliente.jsx). */}
                {linkWhatsapp && (
                  <a
                    href={linkWhatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Ubicar a ${c.nombre} por WhatsApp`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-success/30 bg-success-soft text-xl text-success active:scale-95 transition-transform"
                  >
                    💬
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
