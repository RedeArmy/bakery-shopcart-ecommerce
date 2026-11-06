// El carrito de un visitante se identifica con un UUID que elige el navegador (cabecera X-Cart-Token). No es una
// credencial: solo agrupa las líneas de un carrito anónimo hasta que el visitante inicia sesión y se fusiona.
const KEY = 'shopcart.cartToken';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Si el navegador no deja guardar (modo privado, almacenamiento bloqueado) el token vive en memoria mientras dure la página
let memory: string | null = null;

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memory;
  }
};

/** El token del carrito anónimo si ya existe; nunca crea uno (un visitante que no ha agregado nada no tiene carrito). */
export function peekGuestToken(): string | null {
  const value = read();
  return value !== null && UUID.test(value) ? value : null;
}

/** El token del carrito anónimo; lo crea la primera vez que el visitante agrega algo. */
export function getGuestToken(): string {
  const existing = peekGuestToken();
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
  memory = created;
  try {
    localStorage.setItem(KEY, created);
  } catch {
    // Sin almacenamiento el token queda solo en memoria
  }
  return created;
}

export function clearGuestToken(): void {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar si el almacenamiento no está disponible
  }
}
