import { ESTADO_SOLICITUD } from '../models/prestamo'

// Regla de negocio: se ofrece renovacion cuando el prestamo sigue
// VIGENTE (todavia no se termino de pagar) Y el cliente ya pago Y el
// Maestro ya valido (aprobo) al menos esta cantidad de cuotas. El
// "aprobo" es clave: cuotasPagadas solo se incrementa cuando el
// Maestro confirma el cobro (ver conciliacionService.js), nunca antes.
export const CUOTAS_PAGADAS_PARA_RENOVACION = 1

function vigenteYNoRenovado(prestamo) {
  const cuotasPagadas = prestamo.cuotasPagadas || 0
  const totalCuotas = prestamo.totalCuotas || 0
  const vigente = totalCuotas > 0 && cuotasPagadas < totalCuotas
  return vigente && !prestamo.renovado
}

/**
 * @param {object} prestamo  documento de /prestamos/{id} (necesita
 *                            cuotasPagadas y totalCuotas)
 * @returns {boolean}
 */
export function debeOfrecerRenovacion(prestamo) {
  if (!prestamo) return false
  const cuotasPagadas = prestamo.cuotasPagadas || 0
  return vigenteYNoRenovado(prestamo) && cuotasPagadas >= CUOTAS_PAGADAS_PARA_RENOVACION
}

// Regla de negocio: un cliente puede tener hasta DOS prestamos
// "vigentes" a la vez (pendientes de aprobacion, o aprobados y sin
// terminar de pagar). Al llegar a este maximo, no se puede registrar
// un tercer prestamo nuevo e independiente — solo se puede renovar
// alguno de los que ya tiene (y unicamente despues de pagar la primera
// cuota, ver debeOfrecerRenovacion()) o recalendarizarlo.
export const MAX_PRESTAMOS_VIGENTES = 2

/**
 * Un prestamo deja de ser vigente cuando: lo rechazo el Maestro, ya se
 * pago por completo, o ya fue renovado (su deuda se traspaso a otro).
 *
 * @param {object} prestamo
 * @returns {boolean}
 */
export function esPrestamoVigente(prestamo) {
  if (!prestamo) return false
  if (prestamo.estadoSolicitud === ESTADO_SOLICITUD.RECHAZADO) return false
  return vigenteYNoRenovado(prestamo)
}

/**
 * @param {object[]} prestamos  lista de prestamos de un mismo cliente
 * @returns {object[]} todos los prestamos vigentes (deberian ser a lo
 *                       sumo MAX_PRESTAMOS_VIGENTES si la regla se respeta)
 */
export function obtenerPrestamosVigentes(prestamos) {
  return prestamos?.filter(esPrestamoVigente) || []
}
