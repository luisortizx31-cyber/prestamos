import { Link } from 'react-router-dom'
import { debeOfrecerRenovacion } from '../../utils/renovacion'

/**
 * @param {object} props
 * @param {object} props.prestamo   documento del prestamo (cuotasPagadas, totalCuotas, etc.)
 * @param {string} props.clienteId
 */
export function BotonOfrecerRenovacion({ prestamo, clienteId }) {
  if (!debeOfrecerRenovacion(prestamo)) return null

  return (
    <Link
      to={`/clientes/${clienteId}/prestamos/nuevo?renovarDe=${prestamo.id}`}
      className="mt-3 flex items-center justify-center gap-2 rounded-xl border-2 border-gold bg-gold-soft py-2.5 text-sm font-semibold text-gold active:scale-[0.99] transition-transform"
    >
      <span>⭐</span>
      Ofrecer renovacion
    </Link>
  )
}
