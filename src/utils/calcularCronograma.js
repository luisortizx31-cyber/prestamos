import { TIPO_CUOTA } from '../models/prestamo'

// Reglas de negocio del seguro (fijas, ya no se ingresan a mano):
// - Prestamos menores a S/330: seguro = 3% del monto prestado.
// - Prestamos de S/330 o mas: tarifa plana de S/10.
// El seguro se contabiliza completo en la PRIMERA cuota (no se reparte
// entre todas las cuotas).
const UMBRAL_SEGURO_TARIFA_PLANA = 330
const PORCENTAJE_SEGURO = 3
const TARIFA_PLANA_SEGURO = 10

/**
 * Calcula el seguro segun el monto prestado, siguiendo la regla fija
 * del negocio (ya no es un porcentaje que ingresa el comisionista).
 */
export function calcularSeguro(montoPrestado) {
  if (montoPrestado < UMBRAL_SEGURO_TARIFA_PLANA) {
    return round2(montoPrestado * (PORCENTAJE_SEGURO / 100))
  }
  return TARIFA_PLANA_SEGURO
}

/**
 * Descripcion corta del seguro aplicado, para mostrar en la UI (no
 * afecta el calculo, solo la etiqueta visible).
 */
export function descripcionSeguro(montoPrestado) {
  return montoPrestado < UMBRAL_SEGURO_TARIFA_PLANA
    ? `${PORCENTAJE_SEGURO}%`
    : `Tarifa fija S/ ${TARIFA_PLANA_SEGURO}`
}

/**
 * Calcula el monto total a pagar (capital + interes) y el seguro
 * (regla fija segun el monto, ver calcularSeguro). El seguro se separa
 * del monto del prestamo para la contabilidad, pero se suma a la
 * PRIMERA cuota del cronograma (ver generarCronograma).
 *
 * @param {number} montoPrestado
 * @param {number} tasaInteres   porcentaje, ej. 10 => 10%
 * @param {boolean} [sinSeguro]  si es true, el seguro queda en 0 (el
 *   comisionista/maestro eligio no cobrarlo para este prestamo). Sirve
 *   ademas como el propio indicador al releer el prestamo despues
 *   (montoSeguro nunca da 0 de forma natural — calcularSeguro siempre
 *   devuelve un monto positivo), asi que no hace falta guardar un
 *   campo aparte para saber si se eligio "sin seguro".
 */
export function calcularMontos(montoPrestado, tasaInteres, sinSeguro = false) {
  const montoInteres = round2(montoPrestado * (tasaInteres / 100))
  const montoSeguro = sinSeguro ? 0 : calcularSeguro(montoPrestado)
  const montoTotalAPagar = round2(montoPrestado + montoInteres)

  return {
    montoPrestado: round2(montoPrestado),
    montoInteres,
    montoSeguro,
    montoTotalAPagar,
  }
}

/**
 * Genera el arreglo de cuotas (fecha de vencimiento + monto) según el
 * tipo de cuota elegido. El monto del seguro (si se pasa) se suma
 * completo a la PRIMERA cuota, tal como exige el negocio.
 *
 * @param {object} params
 * @param {number} params.montoTotalAPagar  resultado de calcularMontos()
 * @param {number} [params.montoSeguro]     se suma a la primera cuota
 * @param {string} params.tipoCuota         uno de TIPO_CUOTA
 * @param {number} [params.numeroCuotas]    requerido si no es FECHA_ESPECIFICA
 * @param {Date}   params.fechaInicio       fecha del desembolso
 * @param {Date}   [params.fechaEspecifica] requerido si tipoCuota es FECHA_ESPECIFICA
 * @returns {Array<{numero: number, fechaVencimiento: Date, monto: number, estado: 'pendiente'}>}
 */
export function generarCronograma({
  montoTotalAPagar,
  montoSeguro = 0,
  tipoCuota,
  numeroCuotas,
  fechaInicio,
  fechaEspecifica,
}) {
  let cuotas

  if (tipoCuota === TIPO_CUOTA.FECHA_ESPECIFICA) {
    if (!fechaEspecifica) {
      throw new Error('fechaEspecifica es obligatoria para este tipo de cuota')
    }
    cuotas = [
      {
        numero: 1,
        fechaVencimiento: new Date(fechaEspecifica),
        monto: round2(montoTotalAPagar),
        estado: 'pendiente',
      },
    ]
  } else {
    if (!numeroCuotas || numeroCuotas < 1) {
      throw new Error('numeroCuotas debe ser mayor a 0 para cuotas periódicas')
    }

    const diasEntreCuotas = {
      [TIPO_CUOTA.SEMANAL]: 7,
      [TIPO_CUOTA.QUINCENAL]: 15,
      [TIPO_CUOTA.MENSUAL]: 30,
    }[tipoCuota]

    if (!diasEntreCuotas) {
      throw new Error(`tipoCuota desconocido: ${tipoCuota}`)
    }

    const montoBase = Math.floor((montoTotalAPagar / numeroCuotas) * 100) / 100
    cuotas = []
    let acumulado = 0

    for (let i = 1; i <= numeroCuotas; i++) {
      const fechaVencimiento = new Date(fechaInicio)
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasEntreCuotas * i)

      // La última cuota absorbe el residuo de redondeo para que la suma
      // exacta de cuotas siempre calce con montoTotalAPagar.
      const esUltima = i === numeroCuotas
      const monto = esUltima ? round2(montoTotalAPagar - acumulado) : montoBase
      acumulado = round2(acumulado + monto)

      cuotas.push({
        numero: i,
        fechaVencimiento,
        monto,
        estado: 'pendiente',
      })
    }
  }

  // El seguro se cobra completo dentro de la PRIMERA cuota (no se
  // reparte entre todas). Se suma despues de generar el cronograma
  // para no alterar el calculo de las cuotas restantes.
  if (montoSeguro > 0 && cuotas.length > 0) {
    cuotas[0].monto = round2(cuotas[0].monto + montoSeguro)
  }

  return cuotas
}

function round2(value) {
  return Math.round(value * 100) / 100
}
