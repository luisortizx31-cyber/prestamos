// Comprime y convierte una foto (ej. DNI) a WebP directamente en el
// navegador, antes de subirla a Storage. Se prioriza el menor peso
// posible: reduce el ancho y va bajando la calidad en un loop hasta
// quedar bajo TARGET_SIZE_BYTES o tocar el piso de calidad legible.
const MAX_WIDTH = 1280
const TARGET_SIZE_BYTES = 150 * 1024
const MIN_QUALITY = 0.35
const QUALITY_STEP = 0.1

export async function comprimirImagen(file, opciones = {}) {
  const maxWidth = opciones.maxWidth ?? MAX_WIDTH
  const targetSizeBytes = opciones.targetSizeBytes ?? TARGET_SIZE_BYTES

  const bitmap = await createImageBitmap(file)
  const escala = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * escala)
  const height = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  // Si el navegador no soporta codificar WebP (Safari viejo), toBlob
  // devuelve PNG en su lugar - detectamos eso y usamos JPEG como
  // alternativa, que sí soporta compresión con pérdida.
  let formato = 'image/webp'
  let blob = await toBlobAsync(canvas, formato, 0.8)
  if (!blob || blob.type !== 'image/webp') {
    formato = 'image/jpeg'
    blob = await toBlobAsync(canvas, formato, 0.8)
  }

  let calidad = 0.8
  while (blob && blob.size > targetSizeBytes && calidad > MIN_QUALITY) {
    calidad -= QUALITY_STEP
    blob = await toBlobAsync(canvas, formato, calidad)
  }

  return blob
}

function toBlobAsync(canvas, tipo, calidad) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad))
}
