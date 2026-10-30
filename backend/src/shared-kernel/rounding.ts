/**
 * División entera redondeada al entero más cercano; en empate exacto elige el par (half-even, ADR-0019).
 * Es el equivalente en TypeScript de dbo.FU_Money_HalfEvenDivision y sirve de oráculo en las pruebas:
 * ambas versiones comparten los mismos vectores. Opera solo con bigint, nunca con number.
 */
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new RangeError('Domain: n >= 0 and d > 0');
  const quotient = n / d;
  const remainder = n % d;
  // Se compara contra d - remainder, igual que en SQL, para no depender del tamaño del divisor
  const complement = d - remainder;
  if (remainder > complement) return quotient + 1n;
  if (remainder < complement) return quotient;
  return quotient + (quotient % 2n);
}
