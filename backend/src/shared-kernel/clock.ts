/** Puerto del reloj: permite fijar la hora en las pruebas (expiración de reservas, ventana de depósito). */
export interface Clock {
  now(): Date;
}
