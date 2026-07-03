import { Link } from 'react-router-dom'
import { ESTADO_SOLICITUD } from '../../models/prestamo'

/**
 * @param {object} props
 * @param {object} props.prestamo   documento del prestamo (estadoSolicitud, id)
 * @param {string} props.clienteId
 */
export function BotonEditarPrestamo({ prestamo, clienteId }) {
  if (prestamo.estadoSolicitud !== ESTADO_SOLICITUD.PENDIENTE) return null

  return (
    <Link
      to={`/clientes/${clienteId}/prestamos/${prestamo.id}/editar`}
      className="mt-3 flex items-center justify-center gap-2 rounded-xl border-2 border-line bg-paper py-2.5 text-sm font-semibold text-ink active:scale-[0.99] transition-transform"
    >
      <span>✏️</span>
      Editar solicitud
    </Link>
  )
}
