const CODIGO_PAIS_PERU = '51'

/**
 * Arma el link de wa.me a partir del telefono guardado del cliente
 * (campo libre, sin formato fijo). Normaliza quitando todo lo que no
 * sea digito y antepone el codigo de pais si el numero no lo trae ya
 * (un celular peruano valido son 9 digitos).
 *
 * @param {string} telefono
 * @returns {string|null} null si no hay telefono valido
 */
export function construirLinkWhatsapp(telefono) {
  if (!telefono) return null
  const soloDigitos = telefono.replace(/\D/g, '')
  if (!soloDigitos) return null
  const numero = soloDigitos.startsWith(CODIGO_PAIS_PERU)
    ? soloDigitos
    : `${CODIGO_PAIS_PERU}${soloDigitos}`
  return `https://wa.me/${numero}`
}
