import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../../services/authService'
import { useAuth } from '../../context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { estaAutenticado, cargando, error: errorAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // FIX bug "hay que entrar dos veces": navegamos a "/" solo cuando el
  // AuthContext confirma que la sesion Y el perfil de Firestore ya
  // terminaron de cargar (estaAutenticado = true). Si navegaramos
  // apenas login() resuelve (como antes), ProtectedRoute todavia veria
  // estaAutenticado=false (el perfil tarda un instante mas en llegar) y
  // nos rebotaria de vuelta a /login.
  useEffect(() => {
    if (!cargando && estaAutenticado) {
      navigate('/', { replace: true })
    }
  }, [cargando, estaAutenticado, navigate])

  // Si el contexto reporta un error (ej. el usuario no tiene perfil en
  // /usuarios), lo mostramos aqui y liberamos el boton.
  useEffect(() => {
    if (errorAuth && enviando) {
      setError('Tu cuenta no tiene un perfil valido. Contacta al administrador.')
      setEnviando(false)
    }
  }, [errorAuth, enviando])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await login(email, password)
      // No navegamos aqui a proposito: el useEffect de arriba se encarga
      // apenas el AuthContext confirme que todo esta listo.
    } catch (err) {
      console.error('[LoginPage] Error al iniciar sesion:', err)
      setError('No pudimos iniciar sesion. Revisa tu correo y contraseña.')
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 border-t-4 border-dashed border-brand pt-6 text-center">
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Gestión de préstamos
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Ingresar</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-ink" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 mb-4 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus-visible:border-brand"
            placeholder="tucorreo@ejemplo.com"
          />

          <label className="block text-sm font-medium text-ink" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 mb-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus-visible:border-brand"
            placeholder="••••••••"
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
