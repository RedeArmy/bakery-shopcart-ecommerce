import { useEffect } from 'react';
import { useNow } from '../lib/use-now';

const pad = (value: number): string => String(value).padStart(2, '0');

/** Segundos que faltan para un instante ISO; nunca negativo. El reloj del servidor manda: aquí solo se muestra. */
export const secondsLeft = (until: string, now: number): number =>
  Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));

/**
 * Cuenta regresiva de un plazo (la reserva de 15 minutos, el límite del depósito). Avisa una sola vez al llegar a cero para
 * que quien la usa suelte lo que dependía de ella. Muestra `mm:ss`, o `h:mm:ss` desde una hora.
 */
export function Countdown({
  until,
  onExpire,
  className = '',
}: Readonly<{ until: string; onExpire?: () => void; className?: string }>) {
  const now = useNow(1000);
  const left = secondsLeft(until, now);
  const expired = left === 0;

  useEffect(() => {
    if (expired) onExpire?.();
    // Solo reacciona al cambio de `expired`: el aviso no se repite en cada segundo
  }, [expired]);

  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const text =
    hours > 0
      ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;
  return (
    <time dateTime={until} className={`font-mono tabular-nums ${className}`.trim()}>
      {text}
    </time>
  );
}
