import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
import { ROLES } from '../models/roles'

import LoginPage from '../features/auth/LoginPage'
import DashboardMaestro from '../features/maestro/DashboardMaestro'
import RegistroComisionista from '../features/maestro/RegistroComisionista'
import ConciliacionCaja from '../features/maestro/ConciliacionCaja'
import DetalleComisionista from '../features/maestro/DetalleComisionista'
import DashboardComisionista from '../features/comisionista/DashboardComisionista'
import RegistroCliente from '../features/comisionista/RegistroCliente'
import DetalleCliente from '../features/comisionista/DetalleCliente'
import RegistroPrestamo from '../features/comisionista/RegistroPrestamo'
import ChecklistCuotas from '../features/comisionista/ChecklistCuotas'
import ChecklistDelDia from '../features/comisionista/ChecklistDelDia'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Ruta raiz: redirige segun rol */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RedireccionPorRol />
            </ProtectedRoute>
          }
        />

        {/* Rutas del Maestro */}
        <Route
          path="/comisionistas/nuevo"
          element={
            <ProtectedRoute allowedRoles={[ROLES.MASTER]}>
              <RegistroComisionista />
            </ProtectedRoute>
          }
        />

        <Route
          path="/conciliacion"
          element={
            <ProtectedRoute allowedRoles={[ROLES.MASTER]}>
              <ConciliacionCaja />
            </ProtectedRoute>
          }
        />

        <Route
          path="/comisionistas/:comisionistaId"
          element={
            <ProtectedRoute allowedRoles={[ROLES.MASTER]}>
              <DetalleComisionista />
            </ProtectedRoute>
          }
        />

        {/* Rutas del Comisionista */}
        <Route
          path="/clientes/nuevo"
          element={
            <ProtectedRoute allowedRoles={[ROLES.COLLECTOR]}>
              <RegistroCliente />
            </ProtectedRoute>
          }
        />

        <Route
          path="/clientes/:clienteId"
          element={
            <ProtectedRoute allowedRoles={[ROLES.COLLECTOR, ROLES.MASTER]}>
              <DetalleCliente />
            </ProtectedRoute>
          }
        />

        <Route
          path="/clientes/:clienteId/prestamos/nuevo"
          element={
            <ProtectedRoute allowedRoles={[ROLES.COLLECTOR]}>
              <RegistroPrestamo />
            </ProtectedRoute>
          }
        />

        <Route
          path="/prestamos/:prestamoId/cuotas"
          element={
            <ProtectedRoute allowedRoles={[ROLES.COLLECTOR, ROLES.MASTER]}>
              <ChecklistCuotas />
            </ProtectedRoute>
          }
        />

        <Route
          path="/checklist-dia"
          element={
            <ProtectedRoute allowedRoles={[ROLES.COLLECTOR]}>
              <ChecklistDelDia />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function RedireccionPorRol() {
  const { role } = useAuth()
  if (role === ROLES.MASTER) return <DashboardMaestro />
  if (role === ROLES.COLLECTOR) return <DashboardComisionista />
  return (
    <div className="flex min-h-screen items-center justify-center text-ink-soft px-6 text-center">
      Tu cuenta no tiene un rol valido asignado. Contacta al administrador.
    </div>
  )
}
