import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, collectionGroup, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { logout } from '../../services/authService'
import { useAuth } from '../../context/AuthContext'
import { estadoNotificaciones, activarNotificacionesPush } from '../../services/notificacionesPushService'
import { ESTADO_SOLICITUD, ESTADO_CUOTA } from '../../models/prestamo'
import TabCobranza from './tabs/TabCobranza'
import TabComisionistas from './tabs/TabComisionistas'
import TabSolicitudesCredito from './tabs/TabSolicitudesCredito'
import TabMiCartera from './tabs/TabMiCartera'
import TabReportesCaja from './tabs/TabReportesCaja'
import TabAjustes from './tabs/TabAjustes'

const TABS = [
  { id: 'comisionistas', label: 'Comisionistas', icon: '🧑‍💼', Componente: TabComisionistas },
  { id: 'solicitudes', label: 'Solicitudes', icon: '📝', Componente: TabSolicitudesCredito },
  { id: 'clientes', label: 'Clientes', icon: '👥', Componente: TabCobranza },
  { id: 'mi-cartera', label: 'Mi Cartera', icon: '🧑‍💻', Componente: TabMiCartera },
  { id: 'reportes', label: 'Reportes y Caja', icon: '📊', Componente: TabReportesCaja },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️', Componente: TabAjustes },
]

export default function PanelMaestro() {
  const { usuarioAuth } = useAuth()
  const [tabActiva, setTabActiva] = useState('comisionistas')
  const [pendientes, setPendientes] = useState({ solicitudes: 0, cobros: 0, recalendarizaciones: 0 })
  const [permisoPush, setPermisoPush] = useState('unsupported')
  const [activandoPush, setActivandoPush] = useState(false)

  // Se revisa al entrar (no hace falta un listener: el permiso del
  // navegador solo cambia por accion directa del usuario, nunca en
  // segundo plano) si conviene ofrecer activar las notificaciones.
  useEffect(() => {
    async function cargarEstadoPush() {
      setPermisoPush(estadoNotificaciones().permiso)
    }
    cargarEstadoPush()
  }, [])

  async function handleActivarPush() {
    setActivandoPush(true)
    try {
      const { concedido } = await activarNotificacionesPush(usuarioAuth.uid)
      setPermisoPush(concedido ? 'granted' : 'denied')
    } catch (err) {
      console.error('[PanelMaestro] Error al activar notificaciones push:', err)
      alert('No se pudo activar las notificaciones. Intenta de nuevo mas tarde.')
    } finally {
      setActivandoPush(false)
    }
  }

  // Se calcula una vez al entrar al panel — mismo patron que el resto
  // de las tabs (sin listener en tiempo real), asi que si algo cambia
  // mientras el Maestro esta adentro, se actualiza recien la proxima
  // vez que entre o recargue.
  useEffect(() => {
    async function cargarPendientes() {
      try {
        const [snapSolicitudes, snapCobros, snapRecal] = await Promise.all([
          getDocs(
            query(collection(db, 'prestamos'), where('estadoSolicitud', '==', ESTADO_SOLICITUD.PENDIENTE))
          ),
          getDocs(
            query(collectionGroup(db, 'cuotas'), where('estado', '==', ESTADO_CUOTA.POR_VERIFICAR))
          ),
          getDocs(
            query(collection(db, 'recalendarizaciones'), where('estado', '==', ESTADO_SOLICITUD.PENDIENTE))
          ),
        ])
        setPendientes({
          solicitudes: snapSolicitudes.size,
          cobros: snapCobros.size,
          recalendarizaciones: snapRecal.size,
        })
      } catch (err) {
        console.error('[PanelMaestro] Error al cargar pendientes:', err)
      }
    }
    cargarPendientes()
  }, [])

  const totalPendientes =
    pendientes.solicitudes + pendientes.cobros + pendientes.recalendarizaciones

  const tab = TABS.find((t) => t.id === tabActiva) ?? TABS[0]
  const Componente = tab.Componente

  return (
    <div className="min-h-screen bg-paper pb-10">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Usuario Maestro
          </p>
          <h1 className="text-lg font-semibold text-ink">{tab.label}</h1>
        </div>
        <button
          onClick={() => logout()}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft"
        >
          Salir
        </button>
      </header>

      {permisoPush === 'default' && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
          <span className="text-lg shrink-0">🔔</span>
          <p className="flex-1 min-w-[12rem] text-sm text-ink-soft">
            Activa las notificaciones para enterarte al instante cuando llegue una
            solicitud de prestamo o un cobro nuevo, aunque tengas el celular
            bloqueado.
          </p>
          <button
            onClick={handleActivarPush}
            disabled={activandoPush}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform disabled:opacity-50"
          >
            {activandoPush ? 'Activando...' : 'Activar notificaciones'}
          </button>
        </div>
      )}

      {totalPendientes > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-gold/30 bg-gold-soft px-4 py-3">
          {/* Puntito parpadeante — llama la atencion sin abrir cada pestaña */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
          </span>

          <p className="flex-1 min-w-[12rem] text-sm text-gold">
            <span className="font-semibold">Tenes cosas por aprobar: </span>
            {[
              pendientes.solicitudes > 0 &&
                `${pendientes.solicitudes} solicitud${pendientes.solicitudes !== 1 ? 'es' : ''} de prestamo`,
              pendientes.cobros > 0 &&
                `${pendientes.cobros} cobro${pendientes.cobros !== 1 ? 's' : ''} por verificar`,
              pendientes.recalendarizaciones > 0 &&
                `${pendientes.recalendarizaciones} recalendarizacion${pendientes.recalendarizaciones !== 1 ? 'es' : ''}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <div className="flex shrink-0 gap-2">
            {pendientes.solicitudes > 0 && (
              <button
                onClick={() => setTabActiva('solicitudes')}
                className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform"
              >
                Ver solicitudes
              </button>
            )}
            {(pendientes.cobros > 0 || pendientes.recalendarizaciones > 0) && (
              <Link
                to="/conciliacion"
                className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform"
              >
                Ver caja
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Tabs - estado local, sin router, como pidio el cliente */}
      <nav className="flex border-b border-line bg-surface overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTabActiva(t.id)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tabActiva === t.id
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-soft'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Componente />
      </main>
    </div>
  )
}
