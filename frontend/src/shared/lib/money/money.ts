/**
 * Marcador de posición. Los importes llegan del API como cadenas decimales ("145.00") y el
 * cliente solo las da formato: nunca las convierte a number ni opera con ellas (ADR-0020).
 * La implementación real con Intl.NumberFormat se construye en la Etapa 7.
 */
export function formatMoney(amount: string): string {
  throw new Error(`formatMoney(${amount}) is not implemented yet (Stage 7)`);
}
