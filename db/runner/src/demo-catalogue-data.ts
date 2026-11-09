// Datos de demostración de la tienda: el contenido del catálogo es dato en español (ADR-0024). Las categorías, los atributos
// y los cuatro productos con SKU de ejemplo salen del documento de diseño (sección 4); el resto completa el catálogo hasta
// unos 60 productos para que las pantallas tengan qué paginar, buscar y filtrar. cspell no revisa este archivo.

export interface DemoVariant {
  sku: string;
  /** Valor del atributo Tamaño */
  size: string;
  /** Decimal con dos cifras, como lo exige la API: nunca un number */
  price: string;
  /** Unidades iniciales; 0 deja la variante agotada a propósito para ver ese estado */
  stock: number;
  /** Valor del atributo Sabor, cuando tiene sentido */
  flavour?: string;
  /** Unidades que trae el empaque (por omisión 1: una pieza); con varios empaques, `stock` de la que guarda la existencia son unidades */
  unitsPerPack?: number;
  /** SKU de la variante del mismo producto que guarda la existencia que este empaque comparte; esta no tiene stock propio */
  sharesStockWith?: string;
}

export interface DemoProduct {
  name: string;
  description: string;
  /** Días de anticipación que pide el pedido */
  leadTimeDays: number;
  variants: readonly DemoVariant[];
}

export interface DemoCategory {
  name: string;
  description: string;
  products: readonly DemoProduct[];
}

const v = (
  sku: string,
  size: string,
  price: string,
  stock: number,
  flavour?: string,
): DemoVariant =>
  flavour === undefined ? { sku, size, price, stock } : { sku, size, price, stock, flavour };

/** Un empaque que guarda la existencia compartida de su producto (en unidades): la bolsa de 6 o la docena. */
const pack = (
  sku: string,
  size: string,
  price: string,
  unitsPerPack: number,
  units: number,
): DemoVariant => ({ sku, size, price, stock: units, unitsPerPack });

/** Un empaque que toma sus unidades de otra variante del mismo producto: no guarda existencia propia. */
const sharedPack = (
  sku: string,
  size: string,
  price: string,
  unitsPerPack: number,
  sharesStockWith: string,
): DemoVariant => ({ sku, size, price, stock: 0, unitsPerPack, sharesStockWith });

const p = (
  name: string,
  description: string,
  leadTimeDays: number,
  variants: readonly DemoVariant[],
): DemoProduct => ({ name, description, leadTimeDays, variants });

export const DEMO_CATEGORIES: readonly DemoCategory[] = [
  {
    name: 'Pasteles',
    description: 'Pasteles para celebrar, por porciones, hechos por encargo.',
    products: [
      p('Pastel Tres Leches', 'Bizcocho esponjoso bañado en tres leches con merengue.', 1, [
        v('PAS-3L-06', '6 porciones', '145.00', 12, 'Tres leches'),
        v('PAS-3L-12', '12 porciones', '260.00', 8, 'Tres leches'),
      ]),
      p('Pastel Chocolate', 'Capas de bizcocho de chocolate con ganache oscuro.', 2, [
        v('PAS-CHO-12', '12 porciones', '275.00', 10, 'Chocolate'),
        v('PAS-CHO-24', '24 porciones', '480.00', 6, 'Chocolate'),
      ]),
      p('Pastel Red Velvet', 'Bizcocho rojo aterciopelado con crema de queso.', 2, [
        v('PAS-RV-06', '6 porciones', '175.00', 10, 'Red velvet'),
        v('PAS-RV-12', '12 porciones', '320.00', 7, 'Red velvet'),
      ]),
      p('Pastel de Zanahoria', 'Con nueces y canela, cubierto de crema de queso.', 2, [
        v('PAS-ZAN-06', '6 porciones', '150.00', 10, 'Zanahoria'),
        v('PAS-ZAN-12', '12 porciones', '280.00', 6, 'Zanahoria'),
      ]),
      p('Pastel de Vainilla con Fresas', 'Vainilla suave con crema batida y fresas frescas.', 1, [
        v('PAS-VFR-06', '6 porciones', '140.00', 10, 'Vainilla'),
        v('PAS-VFR-12', '12 porciones', '255.00', 6, 'Vainilla'),
      ]),
      p('Pastel Moka', 'Bizcocho de café con crema de moka y chocolate.', 2, [
        v('PAS-MOK-12', '12 porciones', '285.00', 6),
        v('PAS-MOK-24', '24 porciones', '495.00', 0),
      ]),
      p('Pastel Selva Negra', 'Chocolate, cerezas y crema chantilly.', 2, [
        v('PAS-SEL-12', '12 porciones', '300.00', 6, 'Chocolate'),
        v('PAS-SEL-24', '24 porciones', '520.00', 4, 'Chocolate'),
      ]),
      p('Pastel de Tiramisú', 'Capas de bizcocho de café y crema de mascarpone.', 2, [
        v('PAS-TIR-06', '6 porciones', '185.00', 8),
        v('PAS-TIR-12', '12 porciones', '340.00', 5),
      ]),
      p(
        'Pastel de Frutas',
        'Crema pastelera y frutas de temporada sobre bizcocho de vainilla.',
        1,
        [
          v('PAS-FRU-06', '6 porciones', '155.00', 8, 'Vainilla'),
          v('PAS-FRU-12', '12 porciones', '290.00', 5, 'Vainilla'),
        ],
      ),
      p('Pastel de Queso', 'Estilo horneado, con base de galleta y mermelada de fresa.', 1, [
        v('PAS-QUE-06', '6 porciones', '165.00', 8),
        v('PAS-QUE-12', '12 porciones', '300.00', 5),
      ]),
      p('Pastel de Elote', 'Dulce y húmedo, con elote tierno de la costa.', 1, [
        v('PAS-ELO-06', '6 porciones', '120.00', 10),
        v('PAS-ELO-12', '12 porciones', '220.00', 6),
      ]),
      p('Pastel de Coco', 'Bizcocho con coco rallado y crema de coco.', 2, [
        v('PAS-COC-06', '6 porciones', '150.00', 8, 'Coco'),
        v('PAS-COC-12', '12 porciones', '275.00', 5, 'Coco'),
      ]),
    ],
  },
  {
    name: 'Cupcakes',
    description: 'Cupcakes en cajas listas para regalar.',
    products: [
      p('Cupcakes Red Velvet', 'Con corona de crema de queso.', 1, [
        v('CUP-RV-06', 'Caja de 6', '90.00', 30, 'Red velvet'),
        v('CUP-RV-12', 'Caja de 12', '170.00', 20, 'Red velvet'),
      ]),
      p('Cupcakes de Vainilla', 'Clásicos, con betún de mantequilla.', 0, [
        v('CUP-VAI-06', 'Caja de 6', '75.00', 30, 'Vainilla'),
        v('CUP-VAI-12', 'Caja de 12', '140.00', 20, 'Vainilla'),
      ]),
      p('Cupcakes de Chocolate', 'Con relleno de ganache y betún de chocolate.', 0, [
        v('CUP-CHO-06', 'Caja de 6', '80.00', 30, 'Chocolate'),
        v('CUP-CHO-12', 'Caja de 12', '150.00', 20, 'Chocolate'),
      ]),
      p('Cupcakes de Zanahoria', 'Con nueces y crema de queso.', 1, [
        v('CUP-ZAN-06', 'Caja de 6', '85.00', 24, 'Zanahoria'),
        v('CUP-ZAN-12', 'Caja de 12', '160.00', 16, 'Zanahoria'),
      ]),
      p('Cupcakes de Limón', 'Frescos, con betún de limón.', 1, [
        v('CUP-LIM-06', 'Caja de 6', '80.00', 24),
        v('CUP-LIM-12', 'Caja de 12', '150.00', 16),
      ]),
      p('Cupcakes de Fresa', 'Con trozos de fresa y betún rosado.', 1, [
        v('CUP-FRE-06', 'Caja de 6', '80.00', 0),
      ]),
      p('Cupcakes de Oreo', 'Con galleta triturada y crema de vainilla.', 1, [
        v('CUP-ORE-06', 'Caja de 6', '95.00', 24),
        v('CUP-ORE-12', 'Caja de 12', '180.00', 16),
      ]),
      p('Cupcakes de Dulce de Leche', 'Rellenos de dulce de leche.', 1, [
        v('CUP-DDL-06', 'Caja de 6', '90.00', 24),
      ]),
      p('Cupcakes de Café', 'Con betún suave de café.', 1, [
        v('CUP-CAF-06', 'Caja de 6', '85.00', 24),
      ]),
      p('Cupcakes de Coco', 'Cubiertos de coco tostado.', 1, [
        v('CUP-COC-06', 'Caja de 6', '85.00', 24, 'Coco'),
        v('CUP-COC-12', 'Caja de 12', '160.00', 16, 'Coco'),
      ]),
    ],
  },
  {
    name: 'Galletas',
    description: 'Galletas horneadas cada mañana, en bolsas.',
    products: [
      p('Galletas de avena', 'Con pasas y canela.', 0, [
        v('GAL-AVE-12', 'Bolsa de 12', '45.00', 60),
      ]),
      p('Galletas con Chispas de Chocolate', 'Crujientes por fuera, suaves por dentro.', 0, [
        v('GAL-CHI-12', 'Bolsa de 12', '55.00', 60, 'Chocolate'),
        v('GAL-CHI-24', 'Bolsa de 24', '100.00', 40, 'Chocolate'),
      ]),
      p('Galletas de Mantequilla', 'Receta tradicional, con un toque de vainilla.', 0, [
        v('GAL-MAN-12', 'Bolsa de 12', '50.00', 60, 'Vainilla'),
        v('GAL-MAN-24', 'Bolsa de 24', '90.00', 40, 'Vainilla'),
      ]),
      p('Galletas de Jengibre', 'Especiadas, con un borde de azúcar.', 0, [
        v('GAL-JEN-12', 'Bolsa de 12', '50.00', 50),
      ]),
      p('Polvorones', 'Deshacen en la boca, con almendra molida.', 0, [
        v('GAL-POL-12', 'Bolsa de 12', '60.00', 50),
        v('GAL-POL-24', 'Bolsa de 24', '110.00', 30),
      ]),
      p('Galletas de Limón', 'Con ralladura de limón y glaseado.', 0, [
        v('GAL-LIM-12', 'Bolsa de 12', '50.00', 50),
      ]),
      p('Galletas de Almendra', 'Con láminas de almendra tostada.', 1, [
        v('GAL-ALM-12', 'Bolsa de 12', '70.00', 40),
      ]),
      p('Alfajores', 'Rellenos de dulce de leche y bañados en coco.', 1, [
        v('GAL-ALF-12', 'Bolsa de 12', '75.00', 40),
        v('GAL-ALF-24', 'Bolsa de 24', '140.00', 24),
      ]),
      p('Galletas de Coco', 'Con coco rallado, doradas.', 0, [
        v('GAL-COC-12', 'Bolsa de 12', '50.00', 50, 'Coco'),
      ]),
      p('Galletas Decoradas', 'Decoradas a mano con glasé, por encargo.', 2, [
        v('GAL-DEC-06', 'Bolsa de 6', '85.00', 24),
        v('GAL-DEC-12', 'Bolsa de 12', '160.00', 16),
      ]),
    ],
  },
  {
    name: 'Pan dulce',
    description: 'Pan dulce tradicional, recién horneado.',
    products: [
      p('Conchas', 'Suaves, con cubierta de azúcar de colores.', 0, [
        pack('PAN-CON-06', 'Bolsa de 6', '30.00', 6, 780),
        sharedPack('PAN-CON-12', 'Docena', '55.00', 12, 'PAN-CON-06'),
      ]),
      p('Cuernitos', 'De hojaldre, con mantequilla.', 0, [
        pack('PAN-CUE-06', 'Bolsa de 6', '30.00', 6, 780),
        sharedPack('PAN-CUE-12', 'Docena', '55.00', 12, 'PAN-CUE-06'),
      ]),
      p('Champurradas', 'Crujientes, con ajonjolí, para acompañar el café.', 0, [
        pack('PAN-CHA-12', 'Docena', '35.00', 12, 600),
        sharedPack('PAN-CHA-06', 'Bolsa de 6', '19.00', 6, 'PAN-CHA-12'),
      ]),
      p('Pan de Yema', 'Dorado y esponjoso, con yema de huevo.', 0, [
        pack('PAN-YEM-06', 'Bolsa de 6', '28.00', 6, 780),
        sharedPack('PAN-YEM-12', 'Docena', '50.00', 12, 'PAN-YEM-06'),
      ]),
      p('Quesadilla Guatemalteca', 'Con queso y ajonjolí, para el café de la tarde.', 1, [
        v('PAN-QUE-UN', 'Unidad', '95.00', 16),
      ]),
      p('Rosquillas', 'De masa de maíz, con canela y azúcar.', 0, [
        v('PAN-ROS-12', 'Docena', '40.00', 40),
      ]),
      p('Pan de Banano', 'Húmedo, con banano maduro y nueces.', 1, [
        v('PAN-BAN-UN', 'Unidad', '45.00', 20),
      ]),
      p('Empanadas de Manjar', 'Rellenas de manjar y espolvoreadas con azúcar.', 0, [
        pack('PAN-EMP-06', 'Bolsa de 6', '48.00', 6, 600),
        sharedPack('PAN-EMP-12', 'Docena', '90.00', 12, 'PAN-EMP-06'),
      ]),
      p('Semitas', 'Con relleno de piña y canela.', 0, [
        pack('PAN-SEM-06', 'Bolsa de 6', '32.00', 6, 780),
        sharedPack('PAN-SEM-12', 'Docena', '58.00', 12, 'PAN-SEM-06'),
      ]),
      p('Pan de Molde Artesanal', 'De miga suave, ideal para el desayuno.', 1, [
        v('PAN-MOL-UN', 'Unidad', '38.00', 24),
      ]),
    ],
  },
  {
    name: 'Postres fríos',
    description: 'Postres que se sirven fríos, en porción o para compartir.',
    products: [
      p('Flan de Vainilla', 'Con caramelo, cremoso.', 1, [
        v('POS-FLA-IN', 'Individual', '25.00', 40, 'Vainilla'),
        v('POS-FLA-06', 'Para 6', '130.00', 12, 'Vainilla'),
      ]),
      p('Gelatina de Mosaico', 'De colores, con leche condensada.', 1, [
        v('POS-GEL-06', 'Para 6', '85.00', 16),
        v('POS-GEL-12', 'Para 12', '160.00', 10),
      ]),
      p('Mousse de Chocolate', 'Ligero, con chocolate semiamargo.', 1, [
        v('POS-MOU-IN', 'Individual', '28.00', 40, 'Chocolate'),
        v('POS-MOU-06', 'Para 6', '150.00', 12, 'Chocolate'),
      ]),
      p('Cheesecake Individual', 'Con salsa de frutos rojos.', 1, [
        v('POS-CHE-IN', 'Individual', '32.00', 40),
        v('POS-CHE-06', 'Para 6', '175.00', 10),
      ]),
      p('Tres Leches en Vaso', 'La versión individual del clásico.', 1, [
        v('POS-TLV-IN', 'Individual', '30.00', 40, 'Tres leches'),
      ]),
      p('Arroz con Leche', 'Con canela y pasas.', 1, [
        v('POS-ARR-IN', 'Individual', '20.00', 40),
        v('POS-ARR-06', 'Para 6', '105.00', 12),
      ]),
      p('Panna Cotta', 'Con coulis de fresa.', 1, [
        v('POS-PAN-IN', 'Individual', '30.00', 30, 'Vainilla'),
      ]),
      p('Tiramisú en Vaso', 'Con café y mascarpone.', 1, [
        v('POS-TIV-IN', 'Individual', '35.00', 30),
      ]),
      p('Helado Artesanal de Vainilla', 'Hecho con vainas de vainilla.', 1, [
        v('POS-HEL-LT', '1 litro', '120.00', 12, 'Vainilla'),
      ]),
    ],
  },
  {
    name: 'Temporada',
    description: 'Productos que solo se hornean en su fecha.',
    products: [
      p('Rosca de Reyes', 'Con frutas cristalizadas y el muñeco escondido.', 2, [
        v('TEM-ROS-06', '6 porciones', '140.00', 10),
        v('TEM-ROS-12', '12 porciones', '250.00', 6),
      ]),
      p('Panettone', 'Esponjoso, con frutas confitadas y pasas.', 2, [
        v('TEM-PAN-UN', 'Unidad', '185.00', 12),
      ]),
      p('Torrejas', 'En miel de panela, para Semana Santa.', 1, [
        v('TEM-TOR-06', 'Para 6', '95.00', 16),
      ]),
      p('Buñuelos', 'Fritos, con miel de canela.', 1, [v('TEM-BUN-12', 'Docena', '70.00', 24)]),
      p('Pastel de Calabaza', 'Con especias y crema batida.', 2, [
        v('TEM-CAL-06', '6 porciones', '160.00', 8),
        v('TEM-CAL-12', '12 porciones', '290.00', 5),
      ]),
      p('Galletas de Navidad', 'Con formas de la temporada.', 1, [
        v('TEM-GNA-12', 'Bolsa de 12', '80.00', 24),
      ]),
      p('Pastel del Día de la Madre', 'Decorado con flores de azúcar.', 2, [
        v('TEM-MAD-12', '12 porciones', '310.00', 6),
        v('TEM-MAD-24', '24 porciones', '540.00', 4),
      ]),
      p('Pastel de San Valentín', 'Con forma de corazón y relleno de frambuesa.', 2, [
        v('TEM-SVA-06', '6 porciones', '190.00', 0),
      ]),
      p('Pan Dulce de Temporada', 'Surtido con los sabores del mes.', 0, [
        v('TEM-PDT-12', 'Docena', '65.00', 30),
      ]),
    ],
  },
];

export interface DemoCoupon {
  code: string;
  type: 'Percentage' | 'FixedAmount';
  value: string;
  minimumAmount: string;
  /** Días respecto al momento de sembrar: el cupón vigente empieza ayer y el vencido terminó hace un mes */
  startsInDays: number;
  endsInDays: number;
  totalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  /** Nombre de la categoría a la que se limita, o null para todo el carrito */
  category: string | null;
}

// Los cuatro cupones fijos de la documentación (docs/database/er-diagram.md): uno por cada mensaje de RF-05
export const DEMO_COUPONS: readonly DemoCoupon[] = [
  {
    code: 'WELCOME10',
    type: 'Percentage',
    value: '10.00',
    minimumAmount: '100.00',
    startsInDays: -1,
    endsInDays: 365,
    totalUsageLimit: null,
    perCustomerUsageLimit: 1,
    category: null,
  },
  {
    code: 'CAKES25',
    type: 'FixedAmount',
    value: '25.00',
    minimumAmount: '0.00',
    startsInDays: -1,
    endsInDays: 365,
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    category: 'Pasteles',
  },
  {
    code: 'SOLDOUT',
    type: 'Percentage',
    value: '15.00',
    minimumAmount: '0.00',
    startsInDays: -1,
    endsInDays: 365,
    // Un solo uso: en cuanto un pedido lo usa, el siguiente cliente recibe COUPON_EXHAUSTED. Dejarlo agotado de antemano
    // exigiría un uso sin pedido, y el contador de usos debe igualar siempre los usos reales (conciliación de cupones)
    totalUsageLimit: 1,
    perCustomerUsageLimit: null,
    category: null,
  },
  {
    code: 'EXPIRED',
    type: 'Percentage',
    value: '10.00',
    minimumAmount: '0.00',
    startsInDays: -120,
    endsInDays: -30,
    totalUsageLimit: null,
    perCustomerUsageLimit: null,
    category: null,
  },
];

/** Nombres de los atributos de variante del diseño; se comparten entre todas las variantes */
export const ATTRIBUTE_SIZE = 'Tamaño';
export const ATTRIBUTE_FLAVOUR = 'Sabor';

/** Motivo del asiento del libro de inventario con el que entra cada existencia inicial */
export const DEMO_STOCK_REASON = 'Existencias iniciales de demostración';

export interface DemoBranch {
  name: string;
  line1: string;
  municipality: string;
  department: string;
  phone: string;
  openingHours: string;
}

export interface DemoBankAccount {
  bankName: string;
  accountType: 'Checking' | 'Savings';
  accountNumber: string;
  holderName: string;
  instructions: string;
}

// Dos sucursales de ejemplo para que el cliente pueda elegir recoger su pedido desde el primer arranque
export const DEMO_BRANCHES: readonly DemoBranch[] = [
  {
    name: 'Sucursal Centro',
    line1: '6a avenida 10-20, zona 1',
    municipality: 'Guatemala',
    department: 'Guatemala',
    phone: '2222-1111',
    openingHours: 'Lunes a sábado de 8:00 a 18:00',
  },
  {
    name: 'Sucursal Zona 10',
    line1: '12 calle 3-40, zona 10',
    municipality: 'Guatemala',
    department: 'Guatemala',
    phone: '2333-2222',
    openingHours: 'Lunes a domingo de 9:00 a 19:00',
  },
];

// Dos cuentas ficticias, una monetaria y una de ahorro, marcadas como de ejemplo para que nadie deposite de verdad
export const DEMO_BANK_ACCOUNTS: readonly DemoBankAccount[] = [
  {
    bankName: 'Banco de Ejemplo',
    accountType: 'Checking',
    accountNumber: '0000-000001-1',
    holderName: 'Pastelería',
    instructions: 'Cuenta ficticia de demostración: no realice depósitos reales.',
  },
  {
    bankName: 'Banco de Ejemplo',
    accountType: 'Savings',
    accountNumber: '0000-000002-1',
    holderName: 'Pastelería',
    instructions: 'Cuenta ficticia de demostración: no realice depósitos reales.',
  },
];
