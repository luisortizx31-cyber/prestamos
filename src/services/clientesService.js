import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { ESTADO_CLIENTE } from '../models/prestamo'

/**
 * Crea un cliente final, asociado siempre a un comisionista específico.
 * Nota: el cliente NO es necesariamente un usuario de Auth — para el
 * MVP es solo un registro que el comisionista administra. Si más
 * adelante el cliente necesita loguearse a ver su propio estado, se le
 * puede agregar una cuenta de Auth después sin romper este modelo.
 */
export async function crearCliente({ comisionistaId, nombre, dni, telefono, direccion }) {
  const ref = doc(collection(db, 'clientes'))
  await setDoc(ref, {
    comisionistaId,
    nombre,
    dni,
    telefono: telefono || null,
    direccion: direccion || null,
    estado: ESTADO_CLIENTE.BUEN_PAGADOR, // todo cliente nuevo arranca limpio
    creadoEn: serverTimestamp(),
  })
  return ref.id
}

export async function listarClientesPorComisionista(comisionistaId) {
  const q = query(collection(db, 'clientes'), where('comisionistaId', '==', comisionistaId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
