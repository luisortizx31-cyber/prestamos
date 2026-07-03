import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
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
/**
 * Pasa un cliente (y todos sus prestamos + cuotas) a otro comisionista
 * (o al Maestro, usando su propio uid). Hay que actualizar
 * comisionistaId en LAS TRES colecciones porque esta duplicado a
 * proposito en prestamos y cuotas (ver comentarios en
 * crearPrestamoConCronograma) — si solo se cambiara en /clientes, las
 * Security Rules del comisionista original seguirian "reconociendo"
 * como suyos los prestamos/cuotas viejos.
 */
export async function reasignarCliente(clienteId, nuevoComisionistaId) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'clientes', clienteId), { comisionistaId: nuevoComisionistaId })

  const prestamosSnap = await getDocs(
    query(collection(db, 'prestamos'), where('clienteId', '==', clienteId))
  )
  for (const prestamoDoc of prestamosSnap.docs) {
    batch.update(prestamoDoc.ref, { comisionistaId: nuevoComisionistaId })
    const cuotasSnap = await getDocs(collection(prestamoDoc.ref, 'cuotas'))
    cuotasSnap.docs.forEach((cuotaDoc) => {
      batch.update(cuotaDoc.ref, { comisionistaId: nuevoComisionistaId })
    })
  }

  await batch.commit()
}

/**
 * Reasigna TODOS los clientes de un comisionista a otro de una sola vez
 * — se usa al inhabilitar un comisionista (sus clientes pasan
 * automaticamente al Maestro) y tambien esta disponible para mover
 * varios clientes elegidos a mano.
 *
 * @returns {Promise<number>} cantidad de clientes reasignados
 */
export async function reasignarClientesDeComisionista(comisionistaOrigenId, nuevoComisionistaId) {
  const clientes = await listarClientesPorComisionista(comisionistaOrigenId)
  for (const cliente of clientes) {
    await reasignarCliente(cliente.id, nuevoComisionistaId)
  }
  return clientes.length
}

export async function buscarClientePorDni(dni) {
  const q = query(collection(db, 'clientes'), where('dni', '==', dni.trim()))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}
