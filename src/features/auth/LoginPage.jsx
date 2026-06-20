import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginConDni } from '../../services/authService'
import { validarDni, validarPin } from '../../utils/authVirtual'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { estaAutenticado, cargando, error: errorAuth } = useAuth()
  const [dni, setDni] = useState('')
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // Navega a "/" solo cuando el AuthContext confirma que la sesion Y el
  // perfil de Firestore ya terminaron de cargar. Evita el bug de "hay
  // que entrar dos veces" (ver historial del proyecto).
  useEffect(() => {
    if (!cargando && estaAutenticado) {
      navigate('/', { replace: true })
    }
  }, [cargando, estaAutenticado, navigate])

  useEffect(() => {
    if (errorAuth && enviando) {
      setError('Tu cuenta no tiene un perfil valido. Contacta al administrador.')
      setEnviando(false)
    }
  }, [errorAuth, enviando])

  function handleDni(valor) {
    // Solo digitos, maximo 8 (formato DNI peruano)
    setDni(valor.replace(/\D/g, '').slice(0, 8))
  }

  function handlePin(valor) {
    // Solo digitos, maximo 6
    setPin(valor.replace(/\D/g, '').slice(0, 6))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!validarDni(dni)) {
      setError('El DNI debe tener 8 digitos.')
      return
    }
    if (!validarPin(pin)) {
      setError('El PIN debe tener 6 digitos.')
      return
    }

    setEnviando(true)
    try {
      await loginConDni(dni, pin)
      // No navegamos aqui a proposito: el useEffect de arriba se encarga
      // apenas el AuthContext confirme que todo esta listo.
    } catch (err) {
      console.error('[LoginPage] Error al iniciar sesion:', err)
      setError('DNI o PIN incorrectos.')
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 border-t-4 border-dashed border-brand pt-6 text-center">
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Gestion de prestamos
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Ingresar</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-ink" htmlFor="dni">
            DNI
          </label>
          <input
            id="dni"
            type="text"
            inputMode="numeric"
            autoComplete="username"
            required
            value={dni}
            onChange={(e) => handleDni(e.target.value)}
            className="mt-1 mb-4 w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-lg tracking-wider text-ink outline-none focus-visible:border-brand"
            placeholder="12345678"
            maxLength={8}
          />

          <label className="block text-sm font-medium text-ink" htmlFor="pin">
            PIN
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            value={pin}
            onChange={(e) => handlePin(e.target.value)}
            className="mt-1 mb-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-lg tracking-[0.3em] text-ink outline-none focus-visible:border-brand"
            placeholder="••••••"
            maxLength={6}
          />

          {error && (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-3 w-full rounded-lg bg-brand py-2.5 font-medium text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
