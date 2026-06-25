// Regla de negocio: se ofrece renovacion cuando el prestamo sigue
// VIGENTE (todavia no se termino de pagar) Y el cliente ya pago Y el
// Maestro ya valido (aprobo) al menos esta cantidad de cuotas. El
// "aprobo" es clave: cuotasPagadas solo se incrementa cuando el
// Maestro confirma el cobro (ver conciliacionService.js), nunca antes.
export const CUOTAS_PAGADAS_PARA_RENOVACION = 1

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
