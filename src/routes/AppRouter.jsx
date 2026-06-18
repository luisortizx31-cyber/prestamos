import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
import { ROLES } from '../models/roles'

import LoginPage from '../features/auth/LoginPage'
import DashboardMaestro from '../features/maestro/DashboardMaestro'
import RegistroComisionista from '../features/maestro/RegistroComisionista'
import DashboardComisionista from '../features/comisionista/DashboardComisionista'
import RegistroCliente from '../features/comisionista/RegistroCliente'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RedireccionPorRol />
            </ProtectedRoute>
          }
        />

        <Route
          path="/comisionistas/nuevo"
          element={
            <ProtectedRoute allowedRoles={[ROLES.MASTER]}>
              <RegistroComisionista />
            </ProtectedRoute>
          }
        />

        <Route
          path="/clientes/nuevo"
          element={
            <ProtectedRoute allowedRoles={[ROLES.COLLECTOR]}>
              <RegistroCliente />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/**
 * La ruta "/" no es una pantalla en sí: decide a qué dashboard mandar
 * según el rol del usuario logueado. Mantiene App.jsx y el router
 * limpios de lógica de roles dispersa.
 */
function RedireccionPorRol() {
  const { role } = useAuth()

  if (role === ROLES.MASTER) return <DashboardMaestro />
  if (role === ROLES.COLLECTOR) return <DashboardComisionista />

  return (
    <div className="flex min-h-screen items-center justify-center text-ink-soft">
      Tu cuenta no tiene un rol válido asignado. Contacta al administrador.
    </div>
  )
}
