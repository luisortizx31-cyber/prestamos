// Comprime y convierte una foto (ej. DNI) a WebP directamente en el
// navegador, antes de subirla a Storage. Se prioriza el menor peso
// posible (maximo ~50 KB): primero baja la calidad en un loop hasta el
// piso legible, y si con eso no alcanza el objetivo, ademas va
// reduciendo el ancho en pasadas hasta lograrlo (o hasta MIN_WIDTH).
const MAX_WIDTH = 1280
const MIN_WIDTH = 480
const TARGET_SIZE_BYTES = 50 * 1024
const MIN_QUALITY = 0.35
const QUALITY_STEP = 0.1
const WIDTH_STEP = 0.85

export async function comprimirImagen(file, opciones = {}) {
  const targetSizeBytes = opciones.targetSizeBytes ?? TARGET_SIZE_BYTES
  let maxWidth = opciones.maxWidth ?? MAX_WIDTH

  const bitmap = await createImageBitmap(file)
  let formato = 'image/webp'
  let blob

  for (;;) {
    const escala = Math.min(1, maxWidth / bitmap.width)
    const width = Math.round(bitmap.width * escala)
    const height = Math.round(bitmap.height * escala)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

    // Si el navegador no soporta codificar WebP (Safari viejo), toBlob
    // devuelve PNG en su lugar - detectamos eso y usamos JPEG como
    // alternativa, que sí soporta compresión con pérdida.
    blob = await toBlobAsync(canvas, formato, 0.8)
    if (!blob || blob.type !== 'image/webp') {
      formato = 'image/jpeg'
      blob = await toBlobAsync(canvas, formato, 0.8)
    }

    let calidad = 0.8
    while (blob && blob.size > targetSizeBytes && calidad > MIN_QUALITY) {
      calidad -= QUALITY_STEP
      blob = await toBlobAsync(canvas, formato, calidad)
    }

    if (!blob || blob.size <= targetSizeBytes || maxWidth <= MIN_WIDTH) break
    maxWidth = Math.max(MIN_WIDTH, Math.round(maxWidth * WIDTH_STEP))
  }

  bitmap.close?.()
  return blob
}

function toBlobAsync(canvas, tipo, calidad) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad))
}
