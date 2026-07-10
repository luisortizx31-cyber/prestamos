import { getToken } from 'firebase/messaging'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { auth, db, messagingPromise } from '../config/firebase'

/**
 * Estado actual de las notificaciones push en este navegador: si el
 * dispositivo las soporta, y si el permiso ya fue concedido/negado (para
 * no volver a preguntar si el usuario ya respondio antes).
 */
export function estadoNotificaciones() {
  const soportado = typeof Notification !== 'undefined'
  return {
    soportado,
    permiso: soportado ? Notification.permission : 'unsupported', // 'default' | 'granted' | 'denied'
  }
}

/**
 * Pide permiso de notificaciones al usuario (debe llamarse desde un
 * gesto directo, ej. onClick de un boton) y, si lo concede, registra el
 * token de FCM de este dispositivo en usuarios/{uid}.fcmTokens. Se usa
 * arrayUnion porque el mismo usuario puede tener varios dispositivos
 * (celular + otro celular, etc.) y no queremos pisar tokens anteriores.
 */
export async function activarNotificacionesPush(uid) {
  const messaging = await messagingPromise
  if (!messaging) {
    throw new Error('Este navegador no soporta notificaciones push.')
  }

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') {
    return { concedido: false }
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) {
    throw new Error(
      'Falta configurar VITE_FIREBASE_VAPID_KEY (clave del certificado Web Push de Firebase).'
    )
  }

  const registration = await navigator.serviceWorker.ready
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  })

  await updateDoc(doc(db, 'usuarios', uid), {
    fcmTokens: arrayUnion(token),
  })

  return { concedido: true }
}

/**
 * Avisa al Maestro (push real, via /api/enviar-notificacion) de un
 * evento que necesita su atencion: nueva solicitud de prestamo o cobro
 * por verificar. Pensada para llamarse "fire and forget" desde los
 * servicios que ya escriben en Firestore (prestamosService.js,
 * yapeValidationService.js) — nunca debe romper el flujo principal si
 * el envio falla, por eso el caller la envuelve en try/catch (mismo
 * patron que recalcularEstadoCliente en yapeValidationService.js).
 */
export async function notificarMaestro({ title, body }) {
  const user = auth.currentUser
  if (!user) return

  const idToken = await user.getIdToken()
  const respuesta = await fetch('/api/enviar-notificacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, title, body }),
  })

  if (!respuesta.ok) {
    throw new Error(`/api/enviar-notificacion respondio ${respuesta.status}`)
  }
}
