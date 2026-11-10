import { formatDateOnly, formatDateTime } from '../../../shared/lib/date';
import { formatMoney } from '../../../shared/lib/money/money';

/** La función de traducción que usan las pantallas, sin depender de la librería. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Los campos que guardan un identificador de otra fila: se muestran como «n.º 21». */
const ID_FIELDS = new Set([
  'idvariant',
  'idproduct',
  'idcategory',
  'idparentcategory',
  'idcoupon',
  'idorder',
  'idorderline',
  'idbranch',
  'idpaymentmethod',
  'idpayment',
  'idpaymentproof',
  'idstockvariant',
  'idstockholder',
  'iduser',
]);

/** Los campos que son un importe en quetzales, tal como los guarda la base de datos: texto con dos decimales (ADR-0020). */
const MONEY_FIELDS = new Set([
  'price',
  'minimumamount',
  'subtotal',
  'discount',
  'total',
  'depositedamount',
]);

/** Los campos que son un instante (la base de datos los guarda en UTC) y los que son solo un día. */
const DATE_TIME_FIELDS = new Set(['startsat', 'endsat']);
const DATE_ONLY_FIELDS = new Set(['requesteddeliverydate']);

/** Los campos cuyo valor es una palabra fija de la base de datos, que se traduce (`audit.values.<campo>.<valor>`). */
const ENUM_FIELDS = new Set(['type', 'kind', 'fulfilmenttype', 'status', 'accounttype', 'issue']);

/** Los nombres de los estados de un pedido y de un pago, en el orden de su identificador (semillas S0002 y S0003). */
const ORDER_STATUSES = [
  'PendingPayment',
  'Paid',
  'InPreparation',
  'Dispatched',
  'Delivered',
  'Cancelled',
  'PartiallyReturned',
  'Returned',
] as const;
const PAYMENT_STATUSES = [
  'Pending',
  'UnderReview',
  'Approved',
  'Rejected',
  'Failed',
  'Expired',
  'Refunded',
  'Cancelled',
] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Un nombre de campo sin traducción, legible: «OpeningHours» sale «Opening hours». Nunca se muestra pegado. */
export function humanise(field: string): string {
  const words = field
    .replace(/^ID(?=[A-Z])/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** El nombre de un campo en español. Las claves de traducción van en minúsculas porque unos registros los escriben en camelCase. */
export function fieldLabel(t: Translate, field: string): string {
  return t(`audit.fields.${field.toLowerCase()}`, { defaultValue: humanise(field) });
}

/** El nombre de lo que cambió (Variant, Coupon…) en español; si la base de datos agrega uno nuevo se muestra tal cual. */
export function entityLabel(t: Translate, entityName: string): string {
  return t(`audit.entities.${entityName}`, { defaultValue: entityName });
}

/** Lo que se ve de un identificador: un número como «n.º 21» y cualquier otro texto (una fecha, un código) tal cual. */
export function entityKeyLabel(t: Translate, entityKey: string): string {
  return /^\d+$/.test(entityKey) ? t('audit.entityKey', { key: entityKey }) : entityKey;
}

/** Un instante de la base de datos (UTC, sin zona) o con zona, a la hora de Guatemala; un día solo, como día. */
function formatMoment(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value);
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return Number.isNaN(Date.parse(withZone)) ? value : formatDateTime(withZone);
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatAmount = (value: string): string => {
  try {
    return formatMoney(value);
  } catch {
    return value;
  }
};

/** El valor de un campo cuyo significado depende de otro del mismo registro: el valor de un cupón, un porcentaje o un monto. */
function formatCouponValue(value: string, context: Record<string, unknown>): string {
  return context['type'] === 'Percentage' ? `${value} %` : formatAmount(value);
}

function formatEnum(t: Translate, key: string, value: string): string {
  return t(`audit.values.${key}.${value}`, { defaultValue: value });
}

function formatIdentifier(t: Translate, key: string, value: number | string): string {
  if (key === 'idorderstatus' && typeof value === 'number') {
    const name = ORDER_STATUSES[value - 1];
    return name === undefined ? String(value) : t(`orders.status.${name}`);
  }
  if (key === 'idpaymentstatus' && typeof value === 'number') {
    const name = PAYMENT_STATUSES[value - 1];
    return name === undefined ? String(value) : t(`audit.paymentStatus.${name}`);
  }
  return t('audit.entityKey', { key: String(value) });
}

/** Un valor simple (texto, número, sí o no) como lo lee una persona, según de qué campo es. */
export function formatValue(
  t: Translate,
  field: string,
  value: unknown,
  context: Record<string, unknown> = {},
): string | null {
  if (value === null || value === undefined) return null;
  const key = field.toLowerCase();
  if (typeof value === 'boolean') return value ? t('audit.values.yes') : t('audit.values.no');
  if (key === 'idorderstatus' || key === 'idpaymentstatus' || ID_FIELDS.has(key)) {
    return typeof value === 'number' || typeof value === 'string'
      ? formatIdentifier(t, key, value)
      : null;
  }
  if (typeof value === 'number') {
    return key === 'sizebytes' ? formatSize(value) : String(value);
  }
  if (typeof value !== 'string') return JSON.stringify(value);
  if (key === 'value') return formatCouponValue(value, context);
  if (MONEY_FIELDS.has(key)) return formatAmount(value);
  if (DATE_TIME_FIELDS.has(key) || DATE_ONLY_FIELDS.has(key)) return formatMoment(value);
  if (ENUM_FIELDS.has(key)) return formatEnum(t, key, value);
  return value;
}

/** Un objeto con solo un nombre y un valor (un atributo de una variante) se lee «Tamaño: Bolsa de 6». */
const isNameValue = (value: Record<string, unknown>): boolean => {
  const keys = Object.keys(value).map((key) => key.toLowerCase());
  return keys.length === 2 && keys.includes('name') && keys.includes('value');
};

function formatEntry(t: Translate, entry: Record<string, unknown>): string {
  const lower = Object.fromEntries(Object.entries(entry).map(([k, v]) => [k.toLowerCase(), v]));
  if (isNameValue(entry)) return `${String(lower['name'])}: ${String(lower['value'])}`;
  return Object.entries(entry)
    .map(([field, value]) => {
      const shown = formatValue(t, field, value, lower) ?? t('audit.noValue');
      return `${fieldLabel(t, field)}: ${shown}`;
    })
    .join(' · ');
}

/**
 * Un valor que no es simple (un arreglo de atributos, de líneas devueltas o de filas de la conciliación, o un objeto) como una lista
 * de líneas legibles, una por elemento. Un arreglo vacío no trae nada que mostrar.
 */
export function formatNested(t: Translate, value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      isObject(item) ? formatEntry(t, item) : (formatValue(t, '', item) ?? t('audit.noValue')),
    );
  }
  return isObject(value) ? [formatEntry(t, value)] : [];
}

/** ¿El valor es un arreglo o un objeto, que se muestra como una lista de líneas y no como un solo texto? */
export const isNested = (value: unknown): boolean => Array.isArray(value) || isObject(value);
