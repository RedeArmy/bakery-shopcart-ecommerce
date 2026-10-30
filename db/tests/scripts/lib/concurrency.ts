// Clasificación de los resultados de las llamadas concurrentes. Es lógica pura para poder probarla sin SQL Server.

export type Outcome = 'reserved' | 'conflict' | 'deadlock' | 'other';

// Números de error de SQL Server y del proyecto (db/CLAUDE.md)
const DEADLOCK_VICTIM = 1205;
const CONFLICT = 50409;

/** Traduce el error (o su ausencia) de una llamada a SP_Inventory_ReserveStock a un resultado contable. */
export function classifyOutcome(error: unknown): Outcome {
  if (error === undefined) return 'reserved';
  const number =
    typeof error === 'object' && error !== null
      ? (error as { number?: unknown }).number
      : undefined;
  if (number === CONFLICT) return 'conflict';
  if (number === DEADLOCK_VICTIM) return 'deadlock';
  return 'other';
}

export type Tally = Record<Outcome, number>;

export function tally(outcomes: readonly Outcome[]): Tally {
  const counts: Tally = { reserved: 0, conflict: 0, deadlock: 0, other: 0 };
  for (const outcome of outcomes) counts[outcome] += 1;
  return counts;
}

/**
 * Reintenta mientras la llamada pierda un deadlock. Es lo que hace el ejecutor del backend: el deadlock revierte la
 * transacción completa del procedimiento, así que repetirlo es seguro. Recursivo para que cada intento espere al anterior.
 */
export async function retryOnDeadlock(
  call: () => Promise<void>,
  attemptsLeft = 5,
): Promise<Outcome> {
  try {
    await call();
    return 'reserved';
  } catch (error) {
    const outcome = classifyOutcome(error);
    if (outcome === 'deadlock' && attemptsLeft > 1) return retryOnDeadlock(call, attemptsLeft - 1);
    return outcome;
  }
}
