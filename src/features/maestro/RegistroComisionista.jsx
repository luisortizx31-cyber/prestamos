import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearComisionista, buscarComisionistaPorDni } from '../../services/comisionistasService'
import { validarDni, validarPin } from '../../utils/authVirtual'
import { consultarDni } from '../../services/dniLookupService'

export default function RegistroComisionista() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ nombre: '', dni: '', pin: '', telefono: '', direccion: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // Validacion de DNI contra RENIEC (VerificaPE), igual que en el
  // registro de clientes: autocompleta el nombre y es solo informativa.
  const [validacionDni, setValidacionDni] = useState(null) // null | 'cargando' | {data} | 'no_encontrado'

  // DNI duplicado: el unico chequeo de esta pantalla que SI bloquea el
  // envio (la validacion RENIEC de arriba es solo informativa).
  const [comisionistaDuplicado, setComisionistaDuplicado] = useState(null)

  function actualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function handleDni(valor) {
    actualizar('dni', valor.replace(/\D/g, '').slice(0, 8))
    setValidacionDni(null)
    setComisionistaDuplicado(null)
  }

  async function handleBlurDni() {
    if (form.dni.length !== 8) return
    setValidacionDni('cargando')
    try {
      const data = await consultarDni(form.dni)
      setValidacionDni({ data })
      if (data?.fullName) {
        actualizar('nombre', data.fullName)
      }
    } catch (err) {
      console.error('[RegistroComisionista] Validacion DNI:', err)
      setValidacionDni('no_encontrado')
    }

    try {
      const existente = await buscarComisionistaPorDni(form.dni)
      setComisionistaDuplicado(existente)
    } catch (err) {
      console.error('[RegistroComisionista] Validacion DNI duplicado:', err)
    }
  }

  function handlePin(valor) {
    actualizar('pin', valor.replace(/\D/g, '').slice(0, 6))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!validarDni(form.dni)) {
      setError('El DNI debe tener 8 digitos.')
      return
    }
    if (!validarPin(form.pin)) {
      setError('El PIN debe tener 6 digitos.')
      return
    }

    setEnviando(true)
    try {
      const existente = await buscarComisionistaPorDni(form.dni)
      if (existente) {
        setComisionistaDuplicado(existente)
        setError(`Ya existe un comisionista registrado con este DNI: ${existente.nombre}.`)
        return
      }
      await crearComisionista(form)
      navigate('/')
    } catch (err) {
      console.error('[RegistroComisionista]', err)
      setError(err.message || 'No se pudo crear el comisionista.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-lg font-semibold text-ink">Nuevo comisionista</h1>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-1">
            <label className="block text-sm font-medium text-ink mb-1">DNI</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={form.dni}
              onChange={(e) => handleDni(e.target.value)}
              onBlur={handleBlurDni}
              placeholder="12345678"
              maxLength={8}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-ink outline-none focus-visible:border-brand"
            />
          </div>

          {/* Validacion informativa - nunca bloquea el formulario */}
          <div className="mb-4 min-h-[1.25rem]">
            {validacionDni === 'cargando' && (
              <p className="text-xs text-ink-soft">Verificando DNI...</p>
            )}
            {validacionDni === 'no_encontrado' && (
              <p className="text-xs text-warning">
                No se encontro informacion publica de este DNI (puede ser normal).
              </p>
            )}
            {validacionDni?.data && (
              <p className="text-xs text-success">
                ✓ DNI valido: {validacionDni.data.fullName}
              </p>
            )}
            {comisionistaDuplicado && (
              <p className="text-xs font-medium text-danger">
                ⚠ Este DNI ya esta registrado como "{comisionistaDuplicado.nombre}".
              </p>
            )}
          </div>

          <Campo
            label="Nombre completo"
            value={form.nombre}
            onChange={(v) => actualizar('nombre', v)}
          />

          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              PIN (6 digitos, el comisionista lo usara para entrar)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={form.pin}
              onChange={(e) => handlePin(e.target.value)}
              placeholder="123456"
              maxLength={6}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-ink outline-none focus-visible:border-brand mb-4"
            />
          </div>

          <Campo
            label="Telefono (opcional)"
            value={form.telefono}
            onChange={(v) => actualizar('telefono', v)}
            required={false}
          />

          <Campo
            label="Direccion (opcional)"
            value={form.direccion}
            onChange={(v) => actualizar('direccion', v)}
            required={false}
          />

          {error && (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || Boolean(comisionistaDuplicado)}
            className="mt-2 w-full rounded-lg bg-brand py-2.5 font-medium text-white disabled:opacity-60"
          >
            {enviando ? 'Creando…' : 'Crear comisionista'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Campo({ label, value, onChange, type = 'text', required = true }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-ink">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus-visible:border-brand"
      />
    </div>
  )
}
