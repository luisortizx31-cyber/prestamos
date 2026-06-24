// Regla de negocio: se ofrece renovacion cuando el prestamo sigue
// VIGENTE (todavia no se termino de pagar) Y el cliente ya pago al
// menos este numero de cuotas. Ajustable aqui sin tocar componentes.
export const CUOTAS_PAGADAS_PARA_RENOVACION = 3

/**
 * @param {object} prestamo  documento de /prestamos/{id} (necesita
 *                            cuotasPagadas y totalCuotas)
 * @returns {boolean}
 */
export function debeOfrecerRenovacion(prestamo) {
  if (!prestamo) return false

  const cuotasPagadas = prestamo.cuotasPagadas || 0
  const totalCuotas = prestamo.totalCuotas || 0

  const vigente = totalCuotas > 0 && cuotasPagadas < totalCuotas
  const yaNoRenovado = !prestamo.renovado // no ofrecer de nuevo si ya se renovo

  return vigente && yaNoRenovado && cuotasPagadas >= CUOTAS_PAGADAS_PARA_RENOVACION
}
