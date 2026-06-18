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

/**
 * Crea un Comisionista nuevo (cuenta de Auth + perfil en Firestore).
 *
 * Problema que resuelve: el SDK de cliente de Firebase Auth, al llamar
 * createUserWithEmailAndPassword, INICIA SESIÓN automáticamente como el
 * usuario recién creado. Si lo hiciéramos directo, el Maestro perdería
 * su propia sesión cada vez que registra a un comisionista.
 *
 * Solución sin Cloud Functions: se crea una segunda instancia de la app
 * de Firebase, completamente aislada de la sesión principal, se usa
 * solo para crear el usuario, y se destruye enseguida. La sesión del
 * Maestro en la app principal nunca se toca.
 *
 * (A futuro, si el proyecto pasa a plan Blaze, esto se puede mover a una
 * Cloud Function callable para mayor prolijidad — pero no es necesario
 * para que funcione correctamente hoy.)
 */
export async function crearComisionista({ nombre, email, password, telefono }) {
  const secondaryApp = initializeApp(app.options, `secondary-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    )
    const uid = credential.user.uid

    await setDoc(doc(db, 'usuarios', uid), {
      uid,
      nombre,
      email,
      telefono: telefono || null,
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
