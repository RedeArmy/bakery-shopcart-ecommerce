// Las fechas de entrega son fechas sin hora ("2030-06-10"): se comparan como texto, porque el formato ISO ordena igual
// que el calendario, y nunca se suman ni restan aquí: el servidor decide qué día es posible.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isDateOnly = (value: string): boolean => DATE_ONLY.test(value);

/** Hoy como texto `aaaa-mm-dd`, en el calendario del navegador. */
export function todayText(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

const longDate = new Intl.DateTimeFormat('es-GT', { dateStyle: 'full' });
const shortDateTime = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

/** `2030-06-10` → "lunes, 10 de junio de 2030". Un texto que no es una fecha se devuelve como llegó. */
export function formatDateOnly(value: string): string {
  if (!isDateOnly(value)) return value;
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  // Se construye en hora local con el mediodía: así ninguna zona horaria la corre de día
  return longDate.format(new Date(year, month - 1, day, 12));
}

/** Un instante ISO del servidor en hora local, para mostrar un plazo. */
export function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : shortDateTime.format(parsed);
}
