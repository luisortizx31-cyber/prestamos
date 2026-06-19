import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { crearPrestamoConCronograma } from '../../services/prestamosService'
import { calcularMontos, generarCronograma } from '../../utils/calcularCronograma'
import { TIPO_CUOTA, TIPO_CUOTA_LABELS } from '../../models/prestamo'

const HOY = new Date().toISOString().split('T')[0]

export default function RegistroPrestamo() {
  const { clienteId } = useParams()
  const { usuarioAuth } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    montoPrestado: '',
    tasaInteres: '',
    porcentajeSeguro: '',
    tipoCuota: TIPO_CUOTA.SEMANAL,
    numeroCuotas: '',
    fechaInicio: HOY,
    fechaEspecifica: '',
  })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  // Preview en vivo: recalcula cada vez que cambia el formulario.
  // useMemo evita recalcular si los valores no cambiaron.
  const preview = useMemo(() => {
    const monto = parseFloat(form.montoPrestado)
    const tasa = parseFloat(form.tasaInteres)
    const seguro = parseFloat(form.porcentajeSeguro)
    const cuotas = parseInt(form.numeroCuotas)

    // El seguro es OPCIONAL: si el campo está vacío se asume 0
    if (!monto || !tasa) return null
    const seguroFinal = isNaN(seguro) ? 0 : seguro

    try {
      const montos = calcularMontos(monto, tasa, seguroFinal)

      const esFechaEspecifica = form.tipoCuota === TIPO_CUOTA.FECHA_ESPECIFICA
      if (!esFechaEspecifica && (!cuotas || cuotas < 1)) return { montos, cronograma: null }

      const cronograma = generarCronograma({
        montoTotalAPagar: montos.montoTotalAPagar,
        tipoCuota: form.tipoCuota,
        numeroCuotas: esFechaEspecifica ? 1 : cuotas,
        fechaInicio: new Date(form.fechaInicio),
        fechaEspecifica: form.fechaEspecifica ? new Date(form.fechaEspecifica) : null,
      })
      return { montos, cronograma }
    } catch {
      return null
    }
  }, [form])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!preview?.cronograma) return
    setError(null)
    setEnviando(true)
    try {
      const prestamoId = await crearPrestamoConCronograma({
        clienteId,
        comisionistaId: usuarioAuth.uid,
        montoPrestado: parseFloat(form.montoPrestado),
        tasaInteres: parseFloat(form.tasaInteres),
        porcentajeSeguro: parseFloat(form.porcentajeSeguro) || 0,
        tipoCuota: form.tipoCuota,
        numeroCuotas: parseInt(form.numeroCuotas) || 1,
        fechaInicio: new Date(form.fechaInicio),
        fechaEspecifica: form.fechaEspecifica ? new Date(form.fechaEspecifica) : null,
      })
      navigate(`/prestamos/${prestamoId}/cuotas`)
    } catch (err) {
      console.error('[RegistroPrestamo]', err)
      setError('No se pudo registrar el prestamo. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const esFechaEspecifica = form.tipoCuota === TIPO_CUOTA.FECHA_ESPECIFICA

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <button
          onClick={() => navigate(-1)}
          className="text-ink-soft text-xl leading-none"
        >
          ←
        </button>
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Nuevo prestamo
          </p>
          <h1 className="text-lg font-semibold text-ink">Registrar prestamo</h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
              Condiciones del prestamo
            </h2>

            <Campo label="Monto prestado (S/)">
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={form.montoPrestado}
                onChange={(e) => set('montoPrestado', e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tasa de interes %">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  required
                  value={form.tasaInteres}
                  onChange={(e) => set('tasaInteres', e.target.value)}
                  placeholder="10"
                  className={inputClass}
                />
              </Campo>
              <Campo label="% Seguro">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.porcentajeSeguro}
                  onChange={(e) => set('porcentajeSeguro', e.target.value)}
                  placeholder="3"
                  className={inputClass}
                />
              </Campo>
            </div>

            <Campo label="Tipo de cuota">
              <select
                value={form.tipoCuota}
                onChange={(e) => set('tipoCuota', e.target.value)}
                className={inputClass}
              >
                {Object.entries(TIPO_CUOTA_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </Campo>

            {!esFechaEspecifica && (
              <Campo label="Numero de cuotas">
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={form.numeroCuotas}
                  onChange={(e) => set('numeroCuotas', e.target.value)}
                  placeholder="4"
                  className={inputClass}
                />
              </Campo>
            )}

            <Campo label="Fecha de inicio">
              <input
                type="date"
                required
                value={form.fechaInicio}
                onChange={(e) => set('fechaInicio', e.target.value)}
                className={inputClass}
              />
            </Campo>

            {esFechaEspecifica && (
              <Campo label="Fecha de pago unico">
                <input
                  type="date"
                  required
                  value={form.fechaEspecifica}
                  onChange={(e) => set('fechaEspecifica', e.target.value)}
                  className={inputClass}
                />
              </Campo>
            )}
          </section>

          {/* Preview en vivo */}
          {preview?.montos && (
            <section className="rounded-2xl border border-brand/30 bg-brand-soft p-5 space-y-3">
              <h2 className="text-sm font-semibold text-brand uppercase tracking-wide">
                Resumen del prestamo
              </h2>
              <div className="space-y-2 text-sm">
                <FilaResumen label="Capital prestado" valor={preview.montos.montoPrestado} />
                <FilaResumen
                  label={`Interes (${form.tasaInteres}%)`}
                  valor={preview.montos.montoInteres}
                />
                <FilaResumen
                  label={`Seguro (${form.porcentajeSeguro || 0}%)`}
                  valor={preview.montos.montoSeguro}
                  nota="Se cobra aparte"
                />
                <div className="border-t border-brand/20 pt-2">
                  <FilaResumen
                    label="Total a cobrar"
                    valor={preview.montos.montoTotalAPagar}
                    grande
                  />
                </div>
              </div>
            </section>
          )}

          {/* Cronograma preview */}
          {preview?.cronograma && (
            <section className="rounded-2xl border border-line bg-surface overflow-hidden">
              <div className="px-5 py-3 border-b border-line">
                <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
                  Cronograma de pagos
                </h2>
              </div>
              <ul className="divide-y divide-line">
                {preview.cronograma.map((c) => (
                  <li key={c.numero} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <span className="text-xs text-ink-soft mr-2">Cuota {c.numero}</span>
                      <span className="text-sm text-ink">
                        {formatFecha(c.fechaVencimiento)}
                      </span>
                    </div>
                    <span className="money text-sm font-medium text-ink">
                      S/ {c.monto.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={enviando || !preview?.cronograma}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {enviando ? 'Guardando...' : 'Confirmar y guardar prestamo'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      {children}
    </div>
  )
}

function FilaResumen({ label, valor, nota, grande }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className={grande ? 'font-semibold text-brand' : 'text-ink-soft'}>{label}</span>
        {nota && <span className="ml-2 text-xs text-ink-soft">({nota})</span>}
      </div>
      <span className={`money ${grande ? 'text-lg font-bold text-brand' : 'text-ink'}`}>
        S/ {valor.toFixed(2)}
      </span>
    </div>
  )
}

function formatFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus-visible:border-brand'
