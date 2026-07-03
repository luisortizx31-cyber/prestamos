import { useState, useCallback } from 'react'
import { solicitarRecalendarizacion } from '../../services/recalendarizacionService'
import {
  existeCodigoYape,
  CodigoYapeDuplicadoError,
  METODO_PAGO,
} from '../../services/yapeValidationService'

/**
 * @param {object} props
 * @param {object} props.prestamo       necesita montoInteres, tipoCuota
 * @param {string} props.prestamoId
 * @param {string} props.comisionistaId dueño del cliente
 * @param {string} props.clienteId
 * @param {Function} props.onCerrar     se llama al cancelar O al confirmar con exito
 */
export function ModalRecalendarizar({ prestamo, prestamoId, comisionistaId, clienteId, onCerrar }) {
  const [metodo, setMetodo] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [advertencia, setAdvertencia] = useState(null)
  const [error, setError] = useState(null)

  const montoInteres = prestamo.montoInteres || 0

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
      await solicitarRecalendarizacion({
        prestamoId,
        clienteId,
        comisionistaId,
        metodoPago: metodo,
        codigoYape: metodo === METODO_PAGO.YAPE ? codigo.trim() : null,
      })
      onCerrar()
    } catch (err) {
      if (err instanceof CodigoYapeDuplicadoError) {
        setError('Codigo Yape duplicado: este comprobante ya fue registrado.')
      } else {
        console.error('[ModalRecalendarizar]', err)
        setError(err.message || 'No se pudo registrar el pago. Intenta de nuevo.')
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
            <p className="text-xs text-ink-soft uppercase tracking-wide">Recalendarizar (solo interes)</p>
            <p className="money text-xl font-bold text-ink">S/ {montoInteres.toFixed(2)}</p>
            <p className="text-sm text-ink-soft">
              El cliente paga solo el interes — el capital no baja. Esto queda
              pendiente de aprobacion del administrador; recien cuando lo
              apruebe se corren las cuotas pendientes un periodo mas adelante.
            </p>
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
              className="mt-3 w-full rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {enviando ? 'Enviando...' : 'Enviar solicitud al administrador'}
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
              <p className="text-sm text-ink-soft mb-1">Monto de interes en efectivo</p>
              <p className="money text-3xl font-bold text-ink">S/ {montoInteres.toFixed(2)}</p>
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
              {enviando ? 'Enviando...' : 'Enviar solicitud al administrador'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
