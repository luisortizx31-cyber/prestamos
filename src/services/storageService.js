import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../config/firebase'

/**
 * Sube una foto del DNI (ya comprimida a WebP/JPEG en el navegador,
 * ver utils/imageCompress.js) y devuelve su URL de descarga.
 *
 * @param {string} clienteId
 * @param {'frente'|'reverso'} lado
 * @param {Blob} blob
 */
export async function subirFotoDni(clienteId, lado, blob) {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const fileRef = ref(storage, `clientes/${clienteId}/dni_${lado}.${ext}`)
  await uploadBytes(fileRef, blob, { contentType: blob.type })
  return getDownloadURL(fileRef)
}
