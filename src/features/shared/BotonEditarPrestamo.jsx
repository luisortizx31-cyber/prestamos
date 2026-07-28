import { ESTADO_SOLICITUD } from '../../models/prestamo'

/**
 * @param {object} props
 * @param {object} props.prestamo   documento del prestamo (estadoSolicitud, cuotasPagadas, id)
 * @param {Function} props.onEditar  se llama con prestamo.id al tocar el boton
 * @param {boolean} [props.esMaestro]  el Maestro edita su propio prestamo
 *        (autoAprobado) mientras nadie le haya cobrado nada todavia — la
 *        validacion real (por cuota) se hace en RegistroPrestamo.jsx.
 */
export function BotonEditarPrestamo({ prestamo, onEditar, esMaestro }) {
  const editable = esMaestro
    ? !prestamo.renovado && !(prestamo.cuotasPagadas > 0)
    : prestamo.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE
  if (!editable) return null

  return (
    <button
      type="button"
      onClick={() => onEditar(prestamo.id)}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-line bg-paper py-2.5 text-sm font-semibold text-ink active:scale-[0.99] transition-transform"
    >
      <span>✏️</span>
      Editar solicitud
    </button>
  )
}
