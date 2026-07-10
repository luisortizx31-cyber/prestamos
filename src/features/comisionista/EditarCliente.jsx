import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { actualizarCliente, actualizarFotosDni } from '../../services/clientesService'
import { comprimirImagen } from '../../utils/imageCompress'
import { subirFotoDni } from '../../services/storageService'
import { Campo, CampoFoto } from '../shared/CamposCliente'

export default function EditarCliente() {
  const { clienteId } = useParams()
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [dni, setDni] = useState('')
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // Fotos del DNI: arrancan con la URL ya guardada (sin blob, no hay
  // nada que volver a subir si el comisionista no las toca). Si elige
  // una foto nueva, ahi si se comprime y se sube al guardar — igual que
  // en RegistroCliente.jsx.
  const [fotoFrente, setFotoFrente] = useState(null)
  const [fotoReverso, setFotoReverso] = useState(null)
  const [comprimiendo, setComprimiendo] = useState(null)

  useEffect(() => {
    async function cargar() {
      try {
        const snap = await getDoc(doc(db, 'clientes', clienteId))
        if (!snap.exists()) return
        const data = snap.data()
        setDni(data.dni || '')
        setForm({
          nombre: data.nombre || '',
          telefono: data.telefono || '',
          direccion: data.direccion || '',
        })
        if (data.dniFrenteUrl) setFotoFrente({ previewUrl: data.dniFrenteUrl })
        if (data.dniReversoUrl) setFotoReverso({ previewUrl: data.dniReversoUrl })
      } catch (err) {
        console.error('[EditarCliente]', err)
        setError('No se pudo cargar el cliente.')
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [clienteId])

  async function handleFotoDni(lado, archivo) {
    if (!archivo) return
    setComprimiendo(lado)
    try {
      const blob = await comprimirImagen(archivo)
      const previewUrl = URL.createObjectURL(blob)
      const setFoto = lado === 'frente' ? setFotoFrente : setFotoReverso
      setFoto((prev) => {
        if (prev?.blob && prev.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return { blob, previewUrl }
      })
    } catch (err) {
      console.error('[EditarCliente] Error al comprimir foto DNI:', err)
      setError('No se pudo procesar la foto. Intenta con otra imagen.')
    } finally {
      setComprimiendo(null)
    }
  }

  function actualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await actualizarCliente(clienteId, form)

      // Solo se re-sube lo que realmente cambio (tiene blob nuevo) - las
      // fotos que ya estaban y no se tocaron se dejan como estan.
      if (fotoFrente?.blob || fotoReverso?.blob) {
        try {
          const [dniFrenteUrl, dniReversoUrl] = await Promise.all([
            fotoFrente?.blob ? subirFotoDni(clienteId, 'frente', fotoFrente.blob) : null,
            fotoReverso?.blob ? subirFotoDni(clienteId, 'reverso', fotoReverso.blob) : null,
          ])
          await actualizarFotosDni(clienteId, { dniFrenteUrl, dniReversoUrl })
        } catch (err) {
          console.error('[EditarCliente] Error al subir fotos del DNI:', err)
          alert('Los datos se guardaron, pero las fotos del DNI no se pudieron subir.')
        }
      }

      navigate(`/clientes/${clienteId}`)
    } catch (err) {
      console.error('[EditarCliente] Error al guardar:', err)
      setError('No se pudo guardar los cambios.')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Cargando...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-4 text-lg font-semibold text-ink">Editar cliente</h1>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink">DNI</label>
            <p className="mt-1 rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-ink-soft">
              {dni}
            </p>
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
            disabled={enviando || Boolean(comprimiendo)}
            className="mt-2 w-full rounded-lg bg-brand py-2.5 font-medium text-white disabled:opacity-60"
          >
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  )
}
