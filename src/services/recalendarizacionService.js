import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { ESTADO_CUOTA, TIPO_CUOTA } from '../models/prestamo'
import { existeCodigoYape, CodigoYapeDuplicadoError, METODO_PAGO } from './yapeValidationService'

const DIAS_POR_TIPO_CUOTA = {
  [TIPO_CUOTA.SEMANAL]: 7,
  [TIPO_CUOTA.QUINCENAL]: 15,
  [TIPO_CUOTA.MENSUAL]: 30,
}

/**
 * "Solo interes" / recalendarizacion: el cliente no puede pagar la
 * cuota completa esta vez, pero paga el interes del prestamo
 * (prestamo.montoInteres, ya calculado al crear el credito) para
 * "comprar" un periodo mas de plazo. El capital NO se toca — todas las
 * cuotas pendientes de este prestamo se corren un periodo hacia
 * adelante (7/15/30 dias segun tipoCuota), y la cuota que estaba por
 * vencer queda marcada "recalendarizada" para dejar registro de que se
 * puso al dia asi, sin contar como cuota pagada (no incrementa
 * cuotasPagadas ni cuenta para la comision del comisionista).
 *
 * A diferencia de un cobro normal, esto NO pasa por Conciliacion de
 * Caja — se aplica de inmediato.
 *
 * @param {object} params
 * @param {string} params.prestamoId
 * @param {string} params.clienteId
 * @param {string} params.comisionistaId  dueño del cliente (no necesariamente quien registra, ver DetalleCliente.jsx)
 * @param {string} params.metodoPago      METODO_PAGO.YAPE | METODO_PAGO.EFECTIVO
 * @param {string} [params.codigoYape]    obligatorio si metodoPago es YAPE
 * @returns {Promise<{monto: number, cuotasDesplazadas: number}>}
 */
export async function registrarPagoSoloInteres({
  prestamoId,
  clienteId,
  comisionistaId,
  metodoPago,
  codigoYape,
}) {
  const prestamoRef = doc(db, 'prestamos', prestamoId)
  const prestamoSnap = await getDoc(prestamoRef)
  if (!prestamoSnap.exists()) {
    throw new Error('El prestamo no existe.')
  }
  const prestamo = prestamoSnap.data()

  const diasDesplazar = DIAS_POR_TIPO_CUOTA[prestamo.tipoCuota]
  if (!diasDesplazar) {
    throw new Error('Este tipo de prestamo (fecha unica) no admite recalendarizacion.')
  }

  const montoInteres = prestamo.montoInteres || 0
  if (montoInteres <= 0) {
    throw new Error('Este prestamo no tiene un monto de interes valido.')
  }

  const codigo = metodoPago === METODO_PAGO.YAPE ? (codigoYape || '').trim() : null
  if (metodoPago === METODO_PAGO.YAPE) {
    if (!codigo) throw new Error('Falta el codigo de operacion Yape.')
    const yaExiste = await existeCodigoYape(codigo)
    if (yaExiste) throw new CodigoYapeDuplicadoError(codigo)
  }

  const cuotasSnap = await getDocs(
    query(collection(prestamoRef, 'cuotas'), where('estado', '==', ESTADO_CUOTA.PENDIENTE))
  )
  if (cuotasSnap.empty) {
    throw new Error('Este prestamo no tiene cuotas pendientes para recalendarizar.')
  }
  // Se ordena en el cliente (no con orderBy en la query) para no
  // depender de un indice compuesto — mismo patron que cuotasService.js.
  const cuotasPendientes = cuotasSnap.docs.sort((a, b) => a.data().numero - b.data().numero)
  const cuotaActual = cuotasPendientes[0]
  const fechaAnteriorCuota = cuotaActual.data().fechaVencimiento

  const batch = writeBatch(db)

  cuotasPendientes.forEach((cuotaDoc) => {
    const datos = cuotaDoc.data()
    const fechaBase = datos.fechaVencimiento?.toDate
      ? datos.fechaVencimiento.toDate()
      : new Date(datos.fechaVencimiento)
    const nuevaFecha = new Date(fechaBase)
    nuevaFecha.setDate(nuevaFecha.getDate() + diasDesplazar)
    batch.update(cuotaDoc.ref, { fechaVencimiento: nuevaFecha })
  })

  batch.update(cuotaActual.ref, {
    recalendarizada: true,
    fechaRecalendarizacion: serverTimestamp(),
  })

  batch.update(prestamoRef, {
    vecesRecalendarizado: increment(1),
  })

  if (metodoPago === METODO_PAGO.YAPE) {
    batch.set(doc(db, 'codigos_yape_registrados', codigo), {
      codigoYape: codigo,
      prestamoId,
      comisionistaId,
      monto: montoInteres,
      tipo: 'solo_interes',
      fechaRegistro: serverTimestamp(),
    })
  }

  const recalRef = doc(collection(db, 'recalendarizaciones'))
  batch.set(recalRef, {
    prestamoId,
    clienteId,
    comisionistaId,
    cuotaId: cuotaActual.id,
    montoInteresPagado: montoInteres,
    metodoPago,
    codigoYape: codigo,
    cuotasDesplazadas: cuotasPendientes.length,
    diasDesplazados: diasDesplazar,
    fechaAnteriorCuota,
    creadoEn: serverTimestamp(),
  })

  await batch.commit()

  return { monto: montoInteres, cuotasDesplazadas: cuotasPendientes.length }
}
