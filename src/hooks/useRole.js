import { useAuth } from '../context/AuthContext'
import { ROLES } from '../models/roles'

export function useRole() {
  const { role } = useAuth()
  return {
    role,
    esMaestro: role === ROLES.MASTER,
    esComisionista: role === ROLES.COLLECTOR,
    esCliente: role === ROLES.CLIENT,
  }
}
