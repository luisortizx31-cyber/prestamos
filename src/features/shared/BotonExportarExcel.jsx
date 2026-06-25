import { useState } from 'react'
import { exportarAExcel } from '../../services/excelExportService'

/**
 * @param {string} nombreArchivo  sin extension
 * @param {string} nombreHoja
 * @param {Array<{header:string, key:string, width?:number}>} columnas
 * @param {Array<object>} filas
 * @param {string} [label]
 */
export function BotonExportarExcel({ nombreArchivo, nombreHoja, columnas, filas, label = 'Exportar a Excel' }) {
  const [exportando, setExportando] = useState(false)

  async function handleClick() {
    setExportando(true)
    try {
      await exportarAExcel({ nombreArchivo, nombreHoja, columnas, filas })
    } catch (err) {
      console.error('[BotonExportarExcel]', err)
    } finally {
      setExportando(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={exportando || filas.length === 0}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-soft disabled:opacity-50 shrink-0"
    >
      📊 {exportando ? 'Exportando...' : label}
    </button>
  )
}
