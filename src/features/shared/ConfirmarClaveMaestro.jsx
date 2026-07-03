import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { verificarPin } from '../../services/authService'
import { validarPin } from '../../utils/authVirtual'

/**
 * Paso extra de seguridad: cuando el Maestro cobra una cuota de un
 * cliente que NO es suyo (no lo registro el en "Mi Cartera"), se le
 * pide reingresar su propio PIN antes de dejarlo continuar al
 * ModalCobro normal. Evita cobros accidentales si el celular del
 * Maestro queda con la sesion abierta.
 *
 * @param {object} props
 * @param {Function} props.onConfirmar
 * @param {Function} props.onCancelar
 */
export function ConfirmarClaveMaestro({ onConfirmar, onCancelar }) {
  const { perfil } = useAuth()
  const [pin, setPin] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [error, setError] = useState(null)

  function handlePin(valor) {
    setPin(valor.replace(/\D/g, '').slice(0, 6))
    setError(null)
  }

  async function handleConfirmar() {
    if (!validarPin(pin)) {
      setError('El PIN debe tener 6 digitos.')
      return
    }
    setVerificando(true)
    setError(null)
    try {
      await verificarPin(perfil.dni, pin)
      onConfirmar()
    } catch (err) {
      console.error('[ConfirmarClaveMaestro]', err)
      setError('PIN incorrecto.')
    } finally {
      setVerificando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl bg-surface p-6 pb-10 shadow-xl">
        <p className="text-xs text-ink-soft uppercase tracking-wide mb-1">
          Confirmacion de Maestro
        </p>
        <p className="text-sm text-ink-soft mb-4">
          Este cliente no es tuyo. Ingresa tu PIN para confirmar que quieres
          registrar este cobro.
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => handlePin(e.target.value)}
          placeholder="••••••"
          maxLength={6}
          className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-center font-mono text-lg tracking-[0.4em] text-ink outline-none focus-visible:border-brand"
        />
        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 rounded-xl border border-line py-3 text-sm text-ink-soft"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={verificando || pin.length !== 6}
            className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {verificando ? 'Verificando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
