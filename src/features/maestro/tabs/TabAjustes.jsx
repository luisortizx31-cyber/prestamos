import { useEffect, useState } from 'react'
import { limpiarTodoElSistema } from '../../../services/resetService'
import { listarComisionistas } from '../../../services/comisionistasService'

const PALABRA_CONFIRMACION = 'BORRAR'

export default function TabAjustes() {
  const [palabra, setPalabra] = useState('')
  const [estado, setEstado] = useState('idle') // idle | cargando | ok | error
  const [error, setError] = useState(null)

  const [comisionistas, setComisionistas] = useState([])
  const [cargandoComisionistas, setCargandoComisionistas] = useState(true)
  const [errorComisionistas, setErrorComisionistas] = useState(null)
  const [claveVisible, setClaveVisible] = useState(null) // uid del comisionista con la clave destapada

  useEffect(() => {
    async function cargar() {
      setCargandoComisionistas(true)
      setErrorComisionistas(null)
      try {
        const data = await listarComisionistas()
        setComisionistas(data)
      } catch (err) {
        console.error('[TabAjustes] Error al listar comisionistas:', err)
        setErrorComisionistas('No se pudieron cargar los comisionistas.')
      } finally {
        setCargandoComisionistas(false)
      }
    }
    cargar()
  }, [])

  async function handleLimpiar() {
    if (palabra !== PALABRA_CONFIRMACION) return
    setEstado('cargando')
    setError(null)
    try {
      await limpiarTodoElSistema()
      setEstado('ok')
      setPalabra('')
    } catch (err) {
      console.error('[TabAjustes] Error al limpiar:', err)
      setError(err.message || 'Ocurrió un error inesperado.')
      setEstado('error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">Ajustes del sistema</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Herramientas de administración avanzadas.
        </p>
      </div>

      {/* Datos completos de comisionistas, incluida su clave de acceso */}
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-ink">Comisionistas registrados</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Datos completos de cada comisionista, incluida su clave (PIN) de
            acceso — util si un comisionista la olvida. Toca "Ver clave"
            para destaparla.
          </p>
        </div>

        {cargandoComisionistas && <p className="text-sm text-ink-soft">Cargando…</p>}
        {errorComisionistas && <p className="text-sm text-danger">{errorComisionistas}</p>}

        {!cargandoComisionistas && !errorComisionistas && comisionistas.length === 0 && (
          <p className="text-sm text-ink-soft">Todavia no hay comisionistas registrados.</p>
        )}

        {!cargandoComisionistas && !errorComisionistas && comisionistas.length > 0 && (
          <ul className="space-y-3">
            {comisionistas.map((c) => {
              const uid = c.uid ?? c.id
              const claveDestapada = claveVisible === uid
              return (
                <li key={uid} className="rounded-xl border border-line bg-paper p-4 space-y-1.5 text-sm">
                  <p className="font-semibold text-ink">{c.nombre}</p>
                  <FilaDato label="DNI" valor={c.dni} />
                  <FilaDato label="Telefono" valor={c.telefono || '—'} />
                  <FilaDato label="Direccion" valor={c.direccion || '—'} />
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Clave (PIN)</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-medium text-ink">
                        {claveDestapada ? (c.pin || '—') : '••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setClaveVisible(claveDestapada ? null : uid)}
                        className="rounded-lg border border-line px-2 py-0.5 text-xs text-ink-soft active:scale-95 transition-transform"
                      >
                        {claveDestapada ? 'Ocultar' : 'Ver clave'}
                      </button>
                    </span>
                  </div>
                  <FilaDato label="Activo" valor={c.activo === false ? 'No' : 'Si'} />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Zona de peligro */}
      <div className="rounded-2xl border border-danger/40 bg-danger/5 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-danger uppercase tracking-wide">
            Zona de peligro
          </p>
          <h3 className="mt-1 text-base font-semibold text-ink">
            Reiniciar todo el sistema
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Elimina <strong>todos los comisionistas</strong> (perfil Firestore),{' '}
            <strong>todos los clientes</strong>, <strong>todos los préstamos</strong> y
            sus cuotas, y los códigos Yape registrados. El usuario Maestro no se
            elimina.
          </p>
          <p className="mt-2 text-xs text-ink-soft bg-paper rounded-lg px-3 py-2 border border-line">
            Nota: las cuentas de acceso de los comisionistas (Firebase Auth) quedan
            inactivas pero no se eliminan. Si necesitas volver a registrar un comisionista
            con el mismo DNI, elimina su cuenta desde la consola de Firebase.
          </p>
        </div>

        {estado === 'ok' ? (
          <div className="rounded-xl bg-success/10 border border-success/30 px-4 py-3 text-sm text-success font-medium">
            Sistema reiniciado correctamente. Ya puedes empezar desde cero.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm text-ink-soft mb-1">
                Escribe <span className="font-mono font-bold text-danger">{PALABRA_CONFIRMACION}</span> para confirmar
              </label>
              <input
                type="text"
                value={palabra}
                onChange={(e) => {
                  setPalabra(e.target.value)
                  if (estado === 'error') setEstado('idle')
                }}
                placeholder={PALABRA_CONFIRMACION}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-danger/40"
                disabled={estado === 'cargando'}
              />
            </div>

            {estado === 'error' && (
              <p className="text-sm text-danger">{error}</p>
            )}

            <button
              onClick={handleLimpiar}
              disabled={palabra !== PALABRA_CONFIRMACION || estado === 'cargando'}
              className="w-full rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {estado === 'cargando' ? 'Limpiando datos…' : 'Reiniciar sistema completo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function FilaDato({ label, valor }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium text-ink">{valor}</span>
    </div>
  )
}
