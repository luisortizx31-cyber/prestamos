import { useState } from 'react'
import { limpiarTodoElSistema } from '../../../services/resetService'

const PALABRA_CONFIRMACION = 'BORRAR'

export default function TabAjustes() {
  const [palabra, setPalabra] = useState('')
  const [estado, setEstado] = useState('idle') // idle | cargando | ok | error
  const [error, setError] = useState(null)

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
