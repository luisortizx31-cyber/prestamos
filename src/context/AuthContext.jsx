import { createContext, useContext, useEffect, useState } from 'react'
import { suscribirseAEstadoAuth, obtenerPerfilUsuario } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuarioAuth, setUsuarioAuth] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = suscribirseAEstadoAuth(async (user) => {
      setError(null)
      setUsuarioAuth(user)

      if (!user) {
        setPerfil(null)
        setCargando(false)
        return
      }

      try {
        const perfilUsuario = await obtenerPerfilUsuario(user.uid)
        setPerfil(perfilUsuario)
      } catch (err) {
        // Si el usuario existe en Auth pero no tiene documento en
        // /usuarios, es un estado inconsistente — lo tratamos como error
        // visible en vez de dejar pasar a alguien sin rol definido.
        setError(err)
        setPerfil(null)
      } finally {
        setCargando(false)
      }
    })

    return unsubscribe
  }, [])

  const value = {
    usuarioAuth,
    perfil,
    role: perfil?.role ?? null,
    cargando,
    error,
    estaAutenticado: Boolean(usuarioAuth && perfil),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return context
}
