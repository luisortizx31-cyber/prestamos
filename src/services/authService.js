import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import { construirCorreoVirtual, validarDni, validarPin } from '../utils/authVirtual'

/**
 * Login legacy con email/contraseña real. Se mantiene por si en algun
 * caso se necesita un acceso directo por correo, pero el flujo
 * principal del sistema (comisionistas y administrador) usa
 * loginConDni() de abajo.
 */
export async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

/**
 * Login por DNI + PIN: construye el correo virtual internamente y lo
 * procesa de forma transparente con Firebase Auth. El comisionista
 * nunca ve ni necesita saber que existe un "correo" detras de esto.
 */
export async function loginConDni(dni, pin) {
  if (!validarDni(dni)) {
    throw new Error('El DNI debe tener 8 digitos numericos.')
  }
  if (!validarPin(pin)) {
    throw new Error('El PIN debe tener 6 digitos numericos.')
  }
  const correoVirtual = construirCorreoVirtual(dni)
  const credential = await signInWithEmailAndPassword(auth, correoVirtual, pin)
  return credential.user
}

export async function logout() {
  await signOut(auth)
}

/**
 * Lee el documento /usuarios/{uid} para obtener el rol y los datos de
 * perfil. El rol vive en Firestore (no en Custom Claims) para evitar
 * depender de Cloud Functions / plan Blaze en esta primera fase. Las
 * Security Rules validan el rol leyendo este mismo documento con get().
 */
export async function obtenerPerfilUsuario(uid) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error(
      `No existe perfil en /usuarios/${uid}. Todo usuario de Auth debe tener un documento espejo en Firestore con su rol.`
    )
  }
  return { uid, ...snap.data() }
}

/**
 * Suscripción al estado de autenticación. Devuelve una función de
 * limpieza (unsubscribe), pensada para usarse dentro de un useEffect.
 */
export function suscribirseAEstadoAuth(callback) {
  return onAuthStateChanged(auth, callback)
}
