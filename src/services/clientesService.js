import {
  collection,
  doc,
  setDoc,
  updateDoc,
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

/**
 * Guarda las URLs de las fotos del DNI (frente y/o reverso) en el
 * cliente ya creado. Se llama despues de crearCliente porque necesita
 * el clienteId para armar la ruta en Storage.
 */
export async function actualizarFotosDni(clienteId, { dniFrenteUrl, dniReversoUrl }) {
  const datos = {}
  if (dniFrenteUrl) datos.dniFrenteUrl = dniFrenteUrl
  if (dniReversoUrl) datos.dniReversoUrl = dniReversoUrl
  if (Object.keys(datos).length === 0) return
  await updateDoc(doc(db, 'clientes', clienteId), datos)
}

export async function listarClientesPorComisionista(comisionistaId) {
  const q = query(collection(db, 'clientes'), where('comisionistaId', '==', comisionistaId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Busca si ya existe un cliente con ese DNI, sin importar que
 * comisionista lo haya registrado — el DNI identifica a la misma
 * persona en cualquier cuenta, asi que la unicidad es global, no por
 * comisionista.
 *
 * @param {string} dni
 * @returns {Promise<object|null>} el cliente existente, o null si no hay
 */
export async function buscarClientePorDni(dni) {
  const q = query(collection(db, 'clientes'), where('dni', '==', dni.trim()))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}
