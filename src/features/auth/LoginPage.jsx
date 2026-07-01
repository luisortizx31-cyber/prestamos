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
    setDni(valor.replace(/\D/g, '').slice(0, 8))
  }

  function handlePin(valor) {
    setPin(valor.replace(/\D/g, '').slice(0, 6))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!validarDni(dni)) { setError('El DNI debe tener 8 digitos.'); return }
    if (!validarPin(pin)) { setError('El PIN debe tener 6 digitos.'); return }

    setEnviando(true)
    try {
      await loginConDni(dni, pin)
    } catch (err) {
      console.error('[LoginPage]', err)
      setError('DNI o PIN incorrectos.')
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand">

      {/* ── Hero ── */}
      <div className="relative flex flex-col items-center justify-center px-6 pt-16 pb-14 overflow-hidden">
        {/* Círculos decorativos de fondo */}
        <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5" />

        {/* Ícono S/ */}
        <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 shadow-lg ring-1 ring-white/20">
          <span className="font-mono text-4xl font-extrabold text-white tracking-tighter">S/</span>
        </div>

        <h1 className="relative text-center text-3xl font-bold tracking-tight text-white">
          Préstamos Jhairo
        </h1>
        <p className="relative mt-1.5 font-mono text-xs tracking-widest text-white/50 uppercase">
          Sistema de cobranzas
        </p>
      </div>

      {/* ── Tarjeta de formulario ── */}
      <div className="flex flex-1 flex-col rounded-t-3xl bg-paper px-6 pt-8 pb-10 shadow-2xl">
        <h2 className="mb-6 text-lg font-semibold text-ink">Ingresar</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
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
              placeholder="12345678"
              maxLength={8}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 font-mono text-lg tracking-wider text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
            />
          </div>

          <div>
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
              placeholder="••••••"
              maxLength={6}
              className="mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 font-mono text-lg tracking-[0.4em] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 w-full rounded-xl bg-brand py-3.5 text-base font-semibold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60"
          >
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
