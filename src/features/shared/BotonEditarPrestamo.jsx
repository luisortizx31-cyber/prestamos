import { Link } from 'react-router-dom'
import { ESTADO_SOLICITUD } from '../../models/prestamo'

/**
 * @param {object} props
 * @param {object} props.prestamo   documento del prestamo (estadoSolicitud, cuotasPagadas, id)
 * @param {string} props.clienteId
 * @param {boolean} [props.esMaestro]  el Maestro edita su propio prestamo
 *        (autoAprobado) mientras nadie le haya cobrado nada todavia — la
 *        validacion real (por cuota) se hace en RegistroPrestamo.jsx.
 */
export function BotonEditarPrestamo({ prestamo, clienteId, esMaestro }) {
  const editable = esMaestro
    ? !prestamo.renovado && !(prestamo.cuotasPagadas > 0)
    : prestamo.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE
  if (!editable) return null

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
