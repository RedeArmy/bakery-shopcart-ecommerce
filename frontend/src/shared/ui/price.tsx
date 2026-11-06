import { formatMoney } from '../lib/money/money';

/** Un importe tal como lo dicta el API: solo se le da formato, nunca se calcula con él (ADR-0020). */
export function Price({
  amount,
  className = '',
}: Readonly<{ amount: string; className?: string }>) {
  return (
    <span className={`font-display tabular-nums ${className}`.trim()}>{formatMoney(amount)}</span>
  );
}
