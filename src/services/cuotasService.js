import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../config/firebase'

// IMPORTANTE: la regla de seguridad de /cuotas para el comisionista
// exige resource.data.comisionistaId == uid. Sin el where() aqui,
// Firestore rechaza la consulta COMPLETA con "permission denied" (no
// filtra por documento). Y no usamos orderBy('numero') en la query
// porque, combinado con el where() en otro campo, exigiria crear un
// indice compuesto en Firestore — por eso se ordena en el cliente
// (mismo patron que ChecklistCuotas.jsx).
export async function listarCuotasDePrestamo(prestamoId, comisionistaId) {
  const ref = collection(db, 'prestamos', prestamoId, 'cuotas')
  const q = query(ref, where('comisionistaId', '==', comisionistaId))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.numero - b.numero)
}
