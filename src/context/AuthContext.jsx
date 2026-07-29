import { createContext, useContext, useEffect, useState } from 'react'
import { suscribirseAEstadoAuth, obtenerPerfilUsuario, logout } from '../services/authService'
import { registrarActividad, haPasadoElTiempoDeInactividad } from '../utils/inactividad'

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

  // Cierre de sesion automatico despues de 30 min de inactividad (ver
  // src/utils/inactividad.js). El ultimo momento de actividad se guarda
  // en localStorage, no en memoria, para poder detectar tambien el caso
  // de "cerre la app/PWA y la volvi a abrir mas tarde" — en celulares el
  // setInterval de aqui abajo se suspende mientras la app esta en
  // segundo plano, asi que la revision en visibilitychange (al volver a
  // primer plano) es la que realmente atrapa ese caso.
  useEffect(() => {
    if (!usuarioAuth) return

    if (haPasadoElTiempoDeInactividad()) {
      logout()
      return
    }
    registrarActividad()

    const eventosDeActividad = ['mousedown', 'keydown', 'touchstart', 'scroll']
    const marcarActividad = () => registrarActividad()
    eventosDeActividad.forEach((ev) =>
      window.addEventListener(ev, marcarActividad, { passive: true })
    )

    function revisarAlVolverAPrimerPlano() {
      if (document.visibilityState !== 'visible') return
      if (haPasadoElTiempoDeInactividad()) {
        logout()
      } else {
        registrarActividad()
      }
    }
    document.addEventListener('visibilitychange', revisarAlVolverAPrimerPlano)

    const intervalo = setInterval(() => {
      if (haPasadoElTiempoDeInactividad()) logout()
    }, 60 * 1000)

    return () => {
      eventosDeActividad.forEach((ev) => window.removeEventListener(ev, marcarActividad))
      document.removeEventListener('visibilitychange', revisarAlVolverAPrimerPlano)
      clearInterval(intervalo)
    }
  }, [usuarioAuth])

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
