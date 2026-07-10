import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { crearCliente, buscarClientePorDni, actualizarFotosDni } from '../../services/clientesService'
import { consultarDni } from '../../services/dniLookupService'
import { comprimirImagen } from '../../utils/imageCompress'
import { subirFotoDni } from '../../services/storageService'

export default function RegistroCliente() {
  const navigate = useNavigate()
  const { usuarioAuth } = useAuth()
  const [form, setForm] = useState({ nombre: '', dni: '', telefono: '', direccion: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // Validacion de DNI contra RENIEC (VerificaPE). Devuelve nombre completo
  // real sin enmascarar — se autocompleta directamente en el campo nombre.
  const [validacionDni, setValidacionDni] = useState(null) // null | 'cargando' | {data} | 'no_encontrado'

  // DNI duplicado: el unico chequeo de esta pantalla que SI bloquea el
  // envio (la validacion RENIEC de arriba es solo informativa). Un
  // mismo DNI no puede registrarse dos veces, sin importar que
  // comisionista lo intente.
  const [clienteDuplicado, setClienteDuplicado] = useState(null)

  // Fotos del DNI: se comprimen a WebP en el navegador apenas se
  // seleccionan (no al enviar el formulario), asi el comisionista ve
  // de una si la foto quedo legible antes de registrar al cliente.
  const [fotoFrente, setFotoFrente] = useState(null) // { blob, previewUrl } | null
  const [fotoReverso, setFotoReverso] = useState(null)
  const [comprimiendo, setComprimiendo] = useState(null) // null | 'frente' | 'reverso'

  async function handleFotoDni(lado, archivo) {
    if (!archivo) return
    setComprimiendo(lado)
    try {
      const blob = await comprimirImagen(archivo)
      const previewUrl = URL.createObjectURL(blob)
      const setFoto = lado === 'frente' ? setFotoFrente : setFotoReverso
      setFoto((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return { blob, previewUrl }
      })
    } catch (err) {
      console.error('[RegistroCliente] Error al comprimir foto DNI:', err)
      setError('No se pudo procesar la foto. Intenta con otra imagen.')
    } finally {
      setComprimiendo(null)
    }
  }

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
      if (data?.fullName) {
        actualizar('nombre', data.fullName)
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
      const clienteId = await crearCliente({ ...form, comisionistaId: usuarioAuth.uid })

      // El cliente ya quedo registrado en este punto - si falla la
      // subida de fotos no revertimos el registro, solo avisamos.
      if (fotoFrente || fotoReverso) {
        try {
          const [dniFrenteUrl, dniReversoUrl] = await Promise.all([
            fotoFrente ? subirFotoDni(clienteId, 'frente', fotoFrente.blob) : null,
            fotoReverso ? subirFotoDni(clienteId, 'reverso', fotoReverso.blob) : null,
          ])
          await actualizarFotosDni(clienteId, { dniFrenteUrl, dniReversoUrl })
        } catch (err) {
          console.error('[RegistroCliente] Error al subir fotos del DNI:', err)
          alert(
            'El cliente se registro correctamente, pero las fotos del DNI no se pudieron subir.'
          )
        }
      }

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
                ✓ DNI valido: {validacionDni.data.fullName}
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

          <div className="mb-4 grid grid-cols-2 gap-3">
            <CampoFoto
              label="DNI - Frente"
              foto={fotoFrente}
              cargando={comprimiendo === 'frente'}
              onSeleccionar={(archivo) => handleFotoDni('frente', archivo)}
            />
            <CampoFoto
              label="DNI - Reverso"
              foto={fotoReverso}
              cargando={comprimiendo === 'reverso'}
              onSeleccionar={(archivo) => handleFotoDni('reverso', archivo)}
            />
          </div>

          {error && (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || Boolean(clienteDuplicado) || Boolean(comprimiendo)}
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

// Dos botones en vez de un solo selector: en varios celulares (sobre
// todo con la app instalada como PWA) el selector nativo de un solo
// <input type="file"> sin "capture" no ofrece la opcion de camara, solo
// galeria — con "capture" en un input aparte, ese SI abre la camara
// directo, y el otro input (sin capture) mantiene la opcion de elegir
// una foto ya existente.
function CampoFoto({ label, foto, cargando, onSeleccionar }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      <div className="mt-1 flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-paper text-center">
        {foto ? (
          <img src={foto.previewUrl} alt={label} className="h-full w-full object-cover" />
        ) : cargando ? (
          <span className="text-xs text-ink-soft">Comprimiendo…</span>
        ) : (
          <span className="px-2 text-xs text-ink-soft">Elegí una opción abajo</span>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-surface py-1.5 text-[11px] font-medium text-ink active:scale-95 transition-transform">
          📷 Cámara
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onSeleccionar(e.target.files?.[0])}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-surface py-1.5 text-[11px] font-medium text-ink active:scale-95 transition-transform">
          🖼️ Galería
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onSeleccionar(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  )
}
