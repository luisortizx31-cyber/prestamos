import { debeOfrecerRenovacion } from '../../utils/renovacion'

/**
 * @param {object} props
 * @param {object} props.prestamo   documento del prestamo (cuotasPagadas, totalCuotas, etc.)
 * @param {Function} props.onRenovar  se llama con prestamo.id al tocar el boton
 */
export function BotonOfrecerRenovacion({ prestamo, onRenovar }) {
  if (!debeOfrecerRenovacion(prestamo)) return null

  return (
    <button
      type="button"
      onClick={() => onRenovar(prestamo.id)}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gold bg-gold-soft py-2.5 text-sm font-semibold text-gold active:scale-[0.99] transition-transform"
    >
      <span>⭐</span>
      Ofrecer renovacion
    </button>
  )
}
