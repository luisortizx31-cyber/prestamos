import { useState } from 'react'
import { logout } from '../../services/authService'
import TabCobranza from './tabs/TabCobranza'
import TabComisionistas from './tabs/TabComisionistas'
import TabSolicitudesCredito from './tabs/TabSolicitudesCredito'
import TabReportesCaja from './tabs/TabReportesCaja'

const TABS = [
  { id: 'cobranza', label: 'Cobranza', icon: '🗂️', Componente: TabCobranza },
  { id: 'comisionistas', label: 'Comisionistas', icon: '🧑‍💼', Componente: TabComisionistas },
  { id: 'solicitudes', label: 'Solicitudes', icon: '📝', Componente: TabSolicitudesCredito },
  { id: 'reportes', label: 'Reportes y Caja', icon: '📊', Componente: TabReportesCaja },
]

export default function PanelMaestro() {
  const [tabActiva, setTabActiva] = useState('cobranza')

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
