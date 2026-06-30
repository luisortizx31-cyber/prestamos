import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { crearCliente, buscarClientePorDni } from '../../services/clientesService'
import { consultarDni } from '../../services/dniLookupService'

export default function RegistroCliente() {
  const navigate = useNavigate()
  const { usuarioAuth } = useAuth()
  const [form, setForm] = useState({ nombre: '', dni: '', telefono: '', direccion: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // Validacion de DNI contra RENIEC (apiperu.dev). El nombre puede venir
  // parcialmente enmascarado (plan Free, ej. "CA***INA") — se autocompleta
  // igual y el comisionista corrige a mano si hace falta.
  const [validacionDni, setValidacionDni] = useState(null) // null | 'cargando' | {data} | 'no_encontrado'

  // DNI duplicado: el unico chequeo de esta pantalla que SI bloquea el
  // envio (la validacion RENIEC de arriba es solo informativa). Un
  // mismo DNI no puede registrarse dos veces, sin importar que
  // comisionista lo intente.
  const [clienteDuplicado, setClienteDuplicado] = useState(null)

  function actualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function handleDni(valor) {
    const limpio = valor.replace(/\D/g, '').slice(0, 8)
    actualizar('dni', limpio)
    setValidacionDni(null) // se vuelve a validar si el usuario sigue editando
    setClienteDuplicado(null)
  }

  async function handleBlurDni() {
    if (form.dni.length !== 8) return
    setValidacionDni('cargando')
    try {
      const data = await consultarDni(form.dni)
      setValidacionDni({ data })
      if (data?.nombre_completo) {
        actualizar('nombre', data.nombre_completo)
      }
    } catch (err) {
      console.error('[RegistroCliente] Validacion DNI:', err)
      // Nunca bloqueamos el formulario por esto - puede ser que la
      // fuente publica simplemente no tenga el dato.
      setValidacionDni('no_encontrado')
    }

    try {
      const existente = await buscarClientePorDni(form.dni)
      setClienteDuplicado(existente)
    } catch (err) {
      console.error('[RegistroCliente] Validacion DNI duplicado:', err)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    // Re-chequeo justo antes de guardar (no solo en el blur) por si el
    // usuario pego el DNI y envio el formulario sin pasar por blur.
    setEnviando(true)
    try {
      const existente = await buscarClientePorDni(form.dni)
      if (existente) {
        setClienteDuplicado(existente)
        setError(`Ya existe un cliente registrado con este DNI: ${existente.nombre}.`)
        return
      }
      await crearCliente({ ...form, comisionistaId: usuarioAuth.uid })
      navigate('/')
    } catch (err) {
      console.error('[RegistroCliente] Error al guardar:', err)
      setError('No se pudo registrar el cliente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-lg font-semibold text-ink">Nuevo cliente</h1>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-1">
            <label className="block text-sm font-medium text-ink">DNI</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={form.dni}
              onChange={(e) => handleDni(e.target.value)}
              onBlur={handleBlurDni}
              maxLength={8}
              placeholder="12345678"
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-ink outline-none focus-visible:border-brand"
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
                ✓ DNI valido: {validacionDni.data.nombre_completo}
              </p>
            )}
            {clienteDuplicado && (
              <p className="text-xs font-medium text-danger">
                ⚠ Este DNI ya esta registrado como "{clienteDuplicado.nombre}".
              </p>
            )}
          </div>

          <Campo
            label="Nombre completo"
            value={form.nombre}
            onChange={(v) => actualizar('nombre', v)}
          />
          <Campo
            label="Teléfono (opcional)"
            value={form.telefono}
            onChange={(v) => actualizar('telefono', v)}
            required={false}
          />
          <Campo
            label="Dirección (opcional)"
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
            disabled={enviando || Boolean(clienteDuplicado)}
            className="mt-2 w-full rounded-lg bg-brand py-2.5 font-medium text-white disabled:opacity-60"
          >
            {enviando ? 'Guardando…' : 'Registrar cliente'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Campo({ label, value, onChange, required = true }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-ink">{label}</label>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus-visible:border-brand"
      />
    </div>
  )
}
