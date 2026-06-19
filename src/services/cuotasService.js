import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
} from 'firebase/firestore'
import { db } from '../config/firebase'

export async function listarCuotasDePrestamo(prestamoId) {
  const ref = collection(db, 'prestamos', prestamoId, 'cuotas')
  const q = query(ref, orderBy('numero', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
