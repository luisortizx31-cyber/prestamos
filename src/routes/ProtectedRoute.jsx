import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Envuelve una página y exige:
 *  1. Que haya una sesión activa.
 *  2. (Opcional) que el rol del usuario esté dentro de `allowedRoles`.
 *
 * Esto es una conveniencia de UX (evitar que alguien sin permiso vea la
 * pantalla). La seguridad REAL de los datos vive en las Firestore
 * Security Rules — esta capa nunca debe ser la única barrera.
 */
export function ProtectedRoute({ children, allowedRoles }) {
  const { cargando, estaAutenticado, role } = useAuth()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Cargando…
      </div>
    )
  }

  if (!estaAutenticado) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return children
}
