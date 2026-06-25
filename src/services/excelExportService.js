import ExcelJS from 'exceljs'

/**
 * Genera un archivo .xlsx con una sola hoja y lo descarga en el
 * navegador. No requiere backend: todo ocurre en el cliente.
 *
 * @param {object} params
 * @param {string} params.nombreArchivo  sin extension, ej. "reporte_caja"
 * @param {string} params.nombreHoja
 * @param {Array<{header: string, key: string, width?: number}>} params.columnas
 * @param {Array<object>} params.filas    cada fila es un objeto {key: valor}
 */
export async function exportarAExcel({ nombreArchivo, nombreHoja, columnas, filas }) {
  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet(nombreHoja || 'Datos')

  hoja.columns = columnas.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || 18,
  }))

  // Encabezado en negrita, para que se distinga al abrir en Excel
  hoja.getRow(1).font = { bold: true }

  filas.forEach((fila) => hoja.addRow(fila))

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${nombreArchivo}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Convierte un Timestamp de Firestore (o Date, o string) a Date de JS,
 * o null si no hay valor. Util para preparar filas antes de exportar.
 */
export function aFecha(valor) {
  if (!valor) return null
  return valor.toDate ? valor.toDate() : new Date(valor)
}
