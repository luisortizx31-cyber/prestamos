import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../config/firebase'
import { ROLES } from '../models/roles'

async function borrarEnLotes(refs) {
  const LOTE = 400 // Firestore batch max es 500; usamos 400 por margen
  for (let i = 0; i < refs.length; i += LOTE) {
    const batch = writeBatch(db)
    refs.slice(i, i + LOTE).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

/**
 * Elimina TODOS los datos del sistema excepto el perfil del Maestro:
 *   - codigos_yape_registrados
 *   - cuotas (subcolección de cada préstamo)
 *   - prestamos
 *   - clientes
 *   - usuarios con role == collector (perfiles Firestore; la cuenta de
 *     Auth queda huérfana en Firebase pero no permite login útil sin perfil)
 *
 * Solo para uso en desarrollo/pruebas. El botón que llama esta función
 * debe pedir confirmación explícita antes de ejecutarla.
 */
export async function limpiarTodoElSistema() {
  // 1. Códigos Yape
  const yapeSnap = await getDocs(collection(db, 'codigos_yape_registrados'))
  await borrarEnLotes(yapeSnap.docs.map((d) => d.ref))

  // 2. Cuotas (subcolección anidada — hay que borrarlas antes que el préstamo)
  const prestamosSnap = await getDocs(collection(db, 'prestamos'))
  for (const prestamoDoc of prestamosSnap.docs) {
    const cuotasSnap = await getDocs(
      collection(db, 'prestamos', prestamoDoc.id, 'cuotas')
    )
    await borrarEnLotes(cuotasSnap.docs.map((d) => d.ref))
  }

  // 3. Préstamos
  await borrarEnLotes(prestamosSnap.docs.map((d) => d.ref))

  // 4. Clientes
  const clientesSnap = await getDocs(collection(db, 'clientes'))
  await borrarEnLotes(clientesSnap.docs.map((d) => d.ref))

  // 5. Perfiles Firestore de comisionistas (no toca al Maestro)
  const q = query(collection(db, 'usuarios'), where('role', '==', ROLES.COLLECTOR))
  const comisionistasSnap = await getDocs(q)
  await borrarEnLotes(comisionistasSnap.docs.map((d) => d.ref))
}
