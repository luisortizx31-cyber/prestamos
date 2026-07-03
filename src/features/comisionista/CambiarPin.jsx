import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { cambiarPin } from '../../services/authService'
import { validarPin } from '../../utils/authVirtual'

export default function CambiarPin() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [pinActual, setPinActual] = useState('')
  const [pinNuevo, setPinNuevo] = useState('')
  const [pinConfirmar, setPinConfirmar] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)

  function soloDigitos(valor) {
    return valor.replace(/\D/g, '').slice(0, 6)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!validarPin(pinActual) || !validarPin(pinNuevo)) {
      setError('El PIN debe tener 6 digitos.')
      return
    }
    if (pinNuevo !== pinConfirmar) {
      setError('Los dos PIN nuevos no coinciden.')
      return
    }
    if (pinNuevo === pinActual) {
      setError('El PIN nuevo debe ser distinto al actual.')
      return
    }

    setEnviando(true)
    try {
      await cambiarPin(perfil.dni, pinActual, pinNuevo)
      setOk(true)
    } catch (err) {
      console.error('[CambiarPin]', err)
      setError(
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'El PIN actual es incorrecto.'
          : 'No se pudo cambiar el PIN. Intenta de nuevo.'
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm">
        <header className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-ink-soft text-xl leading-none"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold text-ink">Cambiar PIN</h1>
        </header>

        {ok ? (
          <div className="rounded-2xl border border-success/30 bg-success-soft p-5 text-center space-y-3">
            <p className="text-sm font-medium text-success">
              Tu PIN se cambio correctamente. Usalo la proxima vez que ingreses.
            </p>
            <button
              onClick={() => navigate('/')}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
            >
              Volver
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <Campo
              label="PIN actual"
              value={pinActual}
              onChange={(v) => setPinActual(soloDigitos(v))}
            />
            <Campo
              label="PIN nuevo (6 digitos)"
              value={pinNuevo}
              onChange={(v) => setPinNuevo(soloDigitos(v))}
            />
            <Campo
              label="Confirmar PIN nuevo"
              value={pinConfirmar}
              onChange={(v) => setPinConfirmar(soloDigitos(v))}
            />

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {enviando ? 'Guardando...' : 'Cambiar PIN'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Campo({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••"
        maxLength={6}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono tracking-[0.4em] text-ink outline-none focus-visible:border-brand"
      />
    </div>
  )
}
