import { useEffect, useState } from 'react';

/** La hora actual en milisegundos, refrescada cada `everyMs`: para cuentas regresivas que se leen en pantalla. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);
  return now;
}
