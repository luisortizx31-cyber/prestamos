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
import { ESTADO_CUOTA, ESTADO_SOLICITUD, TIPO_CUOTA } from '../models/prestamo'
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
 * "comprar" un periodo mas de plazo.
 *
 * FLUJO EN DOS PASOS, igual que un cobro normal (conciliacionService.js):
 * el comisionista SOLO deja la solicitud "pendiente" — el cronograma NO
 * se toca todavia. Recien cuando el Maestro la aprueba (ver
 * aprobarRecalendarizacion) se corren las fechas. Esto le da al Maestro
 * la misma oportunidad de revisar/rechazar que tiene con cualquier otro
 * cobro, y evita que un comisionista mueva el cronograma sin
 * autorizacion.
 *
 * @param {object} params
 * @param {string} params.prestamoId
 * @param {string} params.clienteId
 * @param {string} params.comisionistaId  dueño del cliente (no necesariamente quien registra, ver DetalleCliente.jsx)
 * @param {string} params.metodoPago      METODO_PAGO.YAPE | METODO_PAGO.EFECTIVO
 * @param {string} [params.codigoYape]    obligatorio si metodoPago es YAPE
 * @returns {Promise<{monto: number}>}
 */
export async function solicitarRecalendarizacion({
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

  if (!DIAS_POR_TIPO_CUOTA[prestamo.tipoCuota]) {
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

  // El where() sobre comisionistaId es obligatorio para que la Security
  // Rule de "list" autorice la consulta al comisionista (misma
  // necesidad que en cuotasService.listarCuotasDePrestamo) — sin el,
  // Firestore no puede garantizar que TODOS los resultados le
  // pertenezcan, y rechaza la consulta completa con permission-denied.
  const cuotasSnap = await getDocs(
    query(
      collection(prestamoRef, 'cuotas'),
      where('estado', '==', ESTADO_CUOTA.PENDIENTE),
      where('comisionistaId', '==', comisionistaId)
    )
  )
  if (cuotasSnap.empty) {
    throw new Error('Este prestamo no tiene cuotas pendientes para recalendarizar.')
  }
  const cuotaActual = cuotasSnap.docs.sort((a, b) => a.data().numero - b.data().numero)[0]

  if (cuotaActual.data().recalendarizacionPendiente) {
    throw new Error('Ya hay una recalendarizacion de este prestamo esperando aprobacion.')
  }

  const batch = writeBatch(db)

  const recalRef = doc(collection(db, 'recalendarizaciones'))
  batch.set(recalRef, {
    prestamoId,
    clienteId,
    comisionistaId,
    cuotaId: cuotaActual.id,
    montoInteresPagado: montoInteres,
    metodoPago,
    codigoYape: codigo,
    estado: ESTADO_SOLICITUD.PENDIENTE,
    creadoEn: serverTimestamp(),
  })

  // Marca la cuota como "en revision" para que la UI no deje mandar
  // otra solicitud encima mientras el Maestro no resuelva esta.
  batch.update(cuotaActual.ref, {
    recalendarizacionPendiente: true,
    recalendarizacionId: recalRef.id,
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

  await batch.commit()

  return { monto: montoInteres }
}

/**
 * El Maestro aprueba la recalendarizacion: recien aqui se corren todas
 * las cuotas pendientes del prestamo un periodo (7/15/30 dias segun
 * tipoCuota), y la cuota que motivo el pedido queda marcada
 * "recalendarizada" (puesta al dia, sin contar como pagada).
 */
export async function aprobarRecalendarizacion(recalId) {
  const recalRef = doc(db, 'recalendarizaciones', recalId)
  const recalSnap = await getDoc(recalRef)
  if (!recalSnap.exists()) throw new Error('La recalendarizacion no existe.')
  const recal = recalSnap.data()

  const prestamoRef = doc(db, 'prestamos', recal.prestamoId)
  const prestamoSnap = await getDoc(prestamoRef)
  if (!prestamoSnap.exists()) throw new Error('El prestamo no existe.')
  const prestamo = prestamoSnap.data()

  const diasDesplazar = DIAS_POR_TIPO_CUOTA[prestamo.tipoCuota]
  if (!diasDesplazar) throw new Error('Este tipo de prestamo no admite recalendarizacion.')

  // El Maestro tiene list() sin filtro (ver Security Rules), asi que
  // aqui si se puede traer TODAS las cuotas pendientes del prestamo.
  const cuotasSnap = await getDocs(
    query(collection(prestamoRef, 'cuotas'), where('estado', '==', ESTADO_CUOTA.PENDIENTE))
  )

  const batch = writeBatch(db)

  cuotasSnap.docs.forEach((cuotaDoc) => {
    const datos = cuotaDoc.data()
    const fechaBase = datos.fechaVencimiento?.toDate
      ? datos.fechaVencimiento.toDate()
      : new Date(datos.fechaVencimiento)
    const nuevaFecha = new Date(fechaBase)
    nuevaFecha.setDate(nuevaFecha.getDate() + diasDesplazar)
    batch.update(cuotaDoc.ref, { fechaVencimiento: nuevaFecha })
  })

  batch.update(doc(db, 'prestamos', recal.prestamoId, 'cuotas', recal.cuotaId), {
    recalendarizada: true,
    recalendarizacionPendiente: false,
    fechaRecalendarizacion: serverTimestamp(),
  })

  batch.update(prestamoRef, {
    vecesRecalendarizado: increment(1),
  })

  batch.update(recalRef, {
    estado: ESTADO_SOLICITUD.APROBADO,
    cuotasDesplazadas: cuotasSnap.size,
    diasDesplazados: diasDesplazar,
    fechaAprobacion: serverTimestamp(),
  })

  await batch.commit()
}

/**
 * El Maestro rechaza la recalendarizacion: la cuota vuelve a quedar
 * disponible (se puede cobrar normal o volver a intentar
 * recalendarizar), y se libera el codigo Yape si tenia uno — mismo
 * patron que rechazarCuota() en conciliacionService.js.
 */
export async function rechazarRecalendarizacion(recalId, motivo) {
  const recalRef = doc(db, 'recalendarizaciones', recalId)
  const recalSnap = await getDoc(recalRef)
  if (!recalSnap.exists()) throw new Error('La recalendarizacion no existe.')
  const recal = recalSnap.data()

  const batch = writeBatch(db)

  batch.update(doc(db, 'prestamos', recal.prestamoId, 'cuotas', recal.cuotaId), {
    recalendarizacionPendiente: false,
    recalendarizacionId: null,
  })

  if (recal.codigoYape) {
    batch.delete(doc(db, 'codigos_yape_registrados', recal.codigoYape))
  }

  batch.update(recalRef, {
    estado: ESTADO_SOLICITUD.RECHAZADO,
    motivoRechazo: motivo || 'No especificado',
    fechaRechazo: serverTimestamp(),
  })

  await batch.commit()
}
