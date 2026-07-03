import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as signOutSecondary,
} from 'firebase/auth'
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { app, db } from '../config/firebase'
import { ROLES } from '../models/roles'
import { construirCorreoVirtual, validarDni, validarPin } from '../utils/authVirtual'

/**
 * Crea un Comisionista nuevo (cuenta de Auth + perfil en Firestore),
 * usando DNI + PIN como credenciales (sin correos reales).
 *
 * Problema 1 que resuelve: el SDK de cliente de Firebase Auth, al llamar
 * createUserWithEmailAndPassword, INICIA SESIÓN automáticamente como el
 * usuario recién creado. Si lo hiciéramos directo, el Maestro perdería
 * su propia sesión cada vez que registra a un comisionista.
 *
 * Solución sin Cloud Functions: se crea una segunda instancia de la app
 * de Firebase, completamente aislada de la sesión principal, se usa
 * solo para crear el usuario, y se destruye enseguida. La sesión del
 * Maestro en la app principal nunca se toca.
 *
 * Problema 2 que resuelve: el cliente no quiere que el personal de
 * campo use correos reales. Por eso aqui se construye un correo
 * "virtual" a partir del DNI (ver utils/authVirtual.js) y se usa el PIN
 * de 6 digitos como contraseña ante Firebase Auth. El comisionista, al
 * loguearse, solo ve "DNI" y "PIN" — nunca un correo.
 */
export async function crearComisionista({ nombre, dni, pin, telefono, direccion }) {
  if (!validarDni(dni)) {
    throw new Error('El DNI debe tener 8 digitos numericos.')
  }
  if (!validarPin(pin)) {
    throw new Error('El PIN debe tener 6 digitos numericos.')
  }

  const correoVirtual = construirCorreoVirtual(dni)
  const secondaryApp = initializeApp(app.options, `secondary-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      correoVirtual,
      pin
    )
    const uid = credential.user.uid

    await setDoc(doc(db, 'usuarios', uid), {
      uid,
      nombre,
      dni: dni.trim(),
      correoVirtual, // guardado solo como referencia/debug, no se usa en la UI
      // Se guarda el PIN en texto plano para que el Maestro pueda
      // consultarlo despues (Tab Ajustes) si el comisionista lo olvida.
      // Firebase Auth NUNCA expone la contraseña ya guardada, asi que
      // sin esto no habria forma de volver a verla. Ojo: esto significa
      // que quien tenga acceso de Maestro puede ver (e impersonar) a
      // cualquier comisionista - es un tradeoff aceptado a proposito.
      pin: pin.trim(),
      telefono: telefono || null,
      direccion: direccion || null,
      role: ROLES.COLLECTOR,
      activo: true,
      creadoEn: serverTimestamp(),
    })

    return uid
  } finally {
    await signOutSecondary(secondaryAuth)
    await deleteApp(secondaryApp)
  }
}

export async function listarComisionistas() {
  const q = query(collection(db, 'usuarios'), where('role', '==', ROLES.COLLECTOR))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function buscarComisionistaPorDni(dni) {
  const q = query(
    collection(db, 'usuarios'),
    where('role', '==', ROLES.COLLECTOR),
    where('dni', '==', dni.trim())
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}
