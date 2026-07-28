// Un <input type="date"> entrega y recibe strings "YYYY-MM-DD". El
// constructor new Date(str) las interpreta como medianoche UTC, no
// medianoche local - en cualquier huso horario detras de UTC (ej. Peru,
// UTC-5) eso corre la fecha un dia para atras apenas se muestra con
// toLocaleDateString() o se le hace aritmetica de dias (setDate/getDate
// son en hora local, pero ya arrancan desde una medianoche que en hora
// local es el dia anterior a las 19:00). Por eso un prestamo semanal
// que arranca el 02 terminaba mostrando la primera cuota el 08 en vez
// del 09. Estas dos funciones son el ida y vuelta seguro entre el input
// y un Date real en hora local.

export function parseFechaLocal(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatFechaISO(fecha) {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
