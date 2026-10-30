// El API garantiza exactamente dos decimales (ADR-0020); cualquier otra forma es un error de contrato
const AMOUNT_PATTERN = /^\d{1,16}\.\d{2}$/;

// El símbolo se antepone a mano: la plantilla de moneda de ICU intercala un espacio que cambia entre
// versiones de Node y navegadores, y el formato del quetzal ("Q145.00") debe ser estable
const CURRENCY_SYMBOL = 'Q';
const formatter = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Da formato a un importe recibido del API como cadena decimal ("145.00" → "Q145.00").
 * Intl.NumberFormat acepta la cadena tal cual y conserva todos los dígitos, así que el importe
 * nunca pasa por un `number`: el cliente solo presenta, nunca calcula (ADR-0020).
 */
export function formatMoney(amount: string): string {
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new RangeError(`Invalid monetary amount: "${amount}"`);
  }
  return `${CURRENCY_SYMBOL}${formatter.format(amount as `${number}`)}`;
}
