import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logout } from '../services/authService'

/**
 * Envuelve una página y exige:
 *  1. Que haya una sesión activa.
 *  2. (Opcional) que el rol del usuario esté dentro de `allowedRoles`.
 *  3. Que la cuenta no este inhabilitada (ver TabAjustes.jsx).
 *
 * Esto es una conveniencia de UX (evitar que alguien sin permiso vea la
 * pantalla). La seguridad REAL de los datos vive en las Firestore
 * Security Rules (activoDe() en firestore.rules) — esta capa nunca debe
 * ser la única barrera.
 */
export function ProtectedRoute({ children, allowedRoles }) {
  const { cargando, estaAutenticado, role, perfil } = useAuth()

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

  if (perfil?.activo === false) {
    return <CuentaInhabilitada motivo={perfil.motivoInhabilitacion} />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return children
}

function CuentaInhabilitada({ motivo }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold text-ink">Tu cuenta fue inhabilitada</p>
      <p className="max-w-sm text-sm text-ink-soft">
        {motivo
          ? `Motivo: ${motivo}`
          : 'Contacta al administrador para mas informacion.'}
      </p>
      <button
        onClick={() => logout()}
        className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft"
      >
        Cerrar sesion
      </button>
    </div>
  )
}
