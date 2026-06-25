import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { ESTADO_SOLICITUD } from '../models/prestamo'

/**
 * Aprueba una solicitud de credito: a partir de este momento el
 * comisionista puede registrar cobros sobre sus cuotas (antes, la
 * Security Rule lo bloquea explicitamente).
 */
export async function aprobarSolicitudCredito(prestamoId) {
  await updateDoc(doc(db, 'prestamos', prestamoId), {
    estadoSolicitud: ESTADO_SOLICITUD.APROBADO,
    fechaAprobacionCredito: serverTimestamp(),
  })
}

/**
 * Rechaza una solicitud de credito. El prestamo y su cronograma quedan
 * en la base de datos (para que el comisionista vea por que se
 * rechazo), pero nunca se podra cobrar ninguna cuota.
 */
export async function rechazarSolicitudCredito(prestamoId, motivo) {
  await updateDoc(doc(db, 'prestamos', prestamoId), {
    estadoSolicitud: ESTADO_SOLICITUD.RECHAZADO,
    motivoRechazoCredito: motivo || 'No especificado',
    fechaRechazoCredito: serverTimestamp(),
  })
}
