// cspell:disable
// Los importes son datos fijos de la prueba: el cliente nunca los calcula, solo los muestra
export const line = (idVariant: number, name: string, quantity: number, extra = {}) => ({
  idCartItem: idVariant * 10,
  idVariant,
  sku: `SKU-${idVariant}`,
  productName: name,
  quantity,
  inscription: null,
  unitPrice: '145.00',
  lineTotal: '145.00',
  available: 20,
  isAvailable: true,
  ...extra,
});

export const cartOf = (lines: ReturnType<typeof line>[], extra = {}) => ({
  idCart: 5,
  couponCode: null,
  couponReason: null,
  subtotal: '290.00',
  discount: '0.00',
  total: '290.00',
  vat: '31.07',
  taxableBase: '258.93',
  itemCount: lines.reduce((sum, item) => sum + item.quantity, 0),
  hasUnavailableLines: false,
  lines,
  ...extra,
});

export const emptyCart = cartOf([], { idCart: null, subtotal: '0.00', total: '0.00', vat: '0.00' });

export const productDetail = (leadTimeDays: number) => ({
  idProduct: 7,
  idCategory: 1,
  categoryName: 'Pasteles',
  name: 'Pastel Tres Leches',
  description: null,
  leadTimeDays,
  isActive: true,
  images: [],
  variants: [
    {
      idVariant: 11,
      sku: 'PAS-3L-06',
      price: '145.00',
      onHandStock: 12,
      available: 12,
      isActive: true,
      attributes: [{ name: 'Tamaño', value: '6 porciones' }],
    },
  ],
});
