import { useState, useCallback } from 'react'
import {
  registrarPagoConValidacionYape,
  registrarPagoEfectivo,
  existeCodigoYape,
  CodigoYapeDuplicadoError,
  METODO_PAGO,
} from '../../services/yapeValidationService'

/**
 * @param {object} props
 * @param {object} props.cuota          { id, numero, monto, fechaVencimiento, ... }
 * @param {string} props.prestamoId
 * @param {string} props.comisionistaId
 * @param {string} props.clienteId      necesario para recalcular el estado del cliente tras el pago
 * @param {Function} props.onCerrar     se llama al cancelar O al pagar con exito
 */
export function ModalCobro({ cuota, prestamoId, comisionistaId, clienteId, onCerrar }) {
  const [metodo, setMetodo] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [advertencia, setAdvertencia] = useState(null)
  const [error, setError] = useState(null)

  const fechaVenc = cuota.fechaVencimiento?.toDate
    ? cuota.fechaVencimiento.toDate()
    : new Date(cuota.fechaVencimiento)

  const verificarRapido = useCallback(async (val) => {
    if (val.length < 4) { setAdvertencia(null); return }
    setVerificando(true)
    try {
      const existe = await existeCodigoYape(val)
      setAdvertencia(existe ? 'Este codigo Yape ya fue registrado anteriormente.' : null)
    } catch {
      // silencioso — la garantia real esta en la transaccion al confirmar
    } finally {
      setVerificando(false)
    }
  }, [])

  function handleCodigo(val) {
    setCodigo(val)
    setError(null)
    verificarRapido(val.trim())
  }

  async function confirmar() {
    setError(null)
    setEnviando(true)
    try {
      if (metodo === METODO_PAGO.YAPE) {
        await registrarPagoConValidacionYape({
          codigoYape: codigo.trim(),
          prestamoId,
          cuotaId: cuota.id,
          comisionistaId,
          clienteId,
          monto: cuota.monto,
        })
      } else {
        await registrarPagoEfectivo({
          prestamoId,
          cuotaId: cuota.id,
          comisionistaId,
          clienteId,
          monto: cuota.monto,
        })
      }
      onCerrar()
    } catch (err) {
      if (err instanceof CodigoYapeDuplicadoError) {
        setError('Codigo Yape duplicado: este comprobante ya fue registrado.')
      } else {
        console.error('[ModalCobro]', err)
        setError('No se pudo registrar el pago. Intenta de nuevo.')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl bg-surface p-6 pb-10 shadow-xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs text-ink-soft uppercase tracking-wide">Registrar cobro</p>
            <p className="money text-xl font-bold text-ink">
              Cuota {cuota.numero} · S/ {cuota.monto.toFixed(2)}
            </p>
            <p className="text-sm text-ink-soft">{formatFecha(fechaVenc)}</p>
          </div>
          <button onClick={onCerrar} className="text-2xl leading-none text-ink-soft px-1">×</button>
        </div>

        {!metodo && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink mb-1">¿Como pago el cliente?</p>
            <button
              onClick={() => setMetodo(METODO_PAGO.YAPE)}
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-line bg-paper p-4 text-left active:border-brand transition-colors"
            >
              <span className="text-2xl">📱</span>
              <div>
                <p className="font-semibold text-ink">Yape</p>
                <p className="text-xs text-ink-soft">Requiere codigo de operacion</p>
              </div>
            </button>
            <button
              onClick={() => setMetodo(METODO_PAGO.EFECTIVO)}
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-line bg-paper p-4 text-left active:border-brand transition-colors"
            >
              <span className="text-2xl">💵</span>
              <div>
                <p className="font-semibold text-ink">Efectivo</p>
                <p className="text-xs text-ink-soft">Sin codigo, confirmacion directa</p>
              </div>
            </button>
          </div>
        )}

        {metodo === METODO_PAGO.YAPE && (
          <div>
            <button
              onClick={() => { setMetodo(null); setCodigo(''); setError(null); setAdvertencia(null) }}
              className="mb-4 text-sm text-ink-soft flex items-center gap-1"
            >
              ← Cambiar metodo
            </button>
            <label className="block text-sm font-medium text-ink mb-1">
              Codigo de operacion Yape
            </label>
            <input
              type="text"
              autoFocus
              value={codigo}
              onChange={(e) => handleCodigo(e.target.value)}
              placeholder="Ingresa el codigo del comprobante"
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 font-mono text-ink outline-none focus-visible:border-brand text-base"
            />
            {verificando && <p className="mt-2 text-xs text-ink-soft">Verificando...</p>}
            {advertencia && !verificando && (
              <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                ⚠ {advertencia}
              </p>
            )}
            {error && (
              <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <button
              onClick={confirmar}
              disabled={!codigo.trim() || !!advertencia || verificando || enviando}
              className="mt-4 w-full rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {enviando ? 'Registrando...' : 'Confirmar pago Yape'}
            </button>
          </div>
        )}

        {metodo === METODO_PAGO.EFECTIVO && (
          <div>
            <button
              onClick={() => { setMetodo(null); setError(null) }}
              className="mb-4 text-sm text-ink-soft flex items-center gap-1"
            >
              ← Cambiar metodo
            </button>
            <div className="rounded-2xl bg-paper border border-line p-4 mb-4 text-center">
              <p className="text-sm text-ink-soft mb-1">Monto a cobrar en efectivo</p>
              <p className="money text-3xl font-bold text-ink">S/ {cuota.monto.toFixed(2)}</p>
            </div>
            {error && (
              <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <button
              onClick={confirmar}
              disabled={enviando}
              className="w-full rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {enviando ? 'Registrando...' : 'Confirmar cobro en efectivo'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatFecha(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
