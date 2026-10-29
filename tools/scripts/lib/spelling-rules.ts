// Reglas de ortografía británica (en-GB). Este archivo contiene a propósito las grafías
// estadounidenses prohibidas, por eso el verificador lo excluye de su propio análisis.

/** Grafía prohibida (en minúsculas, ya separada por palabras) → alternativa británica. */
export const DENY_LIST: Readonly<Record<string, string>> = {
  color: 'colour',
  colors: 'colours',
  colored: 'coloured',
  behavior: 'behaviour',
  behaviors: 'behaviours',
  catalog: 'catalogue',
  catalogs: 'catalogues',
  canceled: 'cancelled',
  canceling: 'cancelling',
  cancelation: 'cancellation',
  authorize: 'authorise',
  authorized: 'authorised',
  authorizes: 'authorises',
  authorizing: 'authorising',
  authorization: 'authorisation',
  initialize: 'initialise',
  initialized: 'initialised',
  initializes: 'initialises',
  initializing: 'initialising',
  initialization: 'initialisation',
  organization: 'organisation',
  organizations: 'organisations',
  organizational: 'organisational',
  center: 'centre',
  centers: 'centres',
  centered: 'centred',
  gray: 'grey',
  grays: 'greys',
  license: 'licence',
  licenses: 'licences',
  analyze: 'analyse',
  analyzed: 'analysed',
  analyzes: 'analyses',
  analyzing: 'analysing',
  artifact: 'artefact',
  artifacts: 'artefacts',
  favorite: 'favourite',
  favorites: 'favourites',
  customize: 'customise',
  customized: 'customised',
  customization: 'customisation',
  recognize: 'recognise',
  recognized: 'recognised',
  summarize: 'summarise',
  summarized: 'summarised',
  serialize: 'serialise',
  serialized: 'serialised',
  serialization: 'serialisation',
  normalize: 'normalise',
  normalized: 'normalised',
  normalization: 'normalisation',
  optimize: 'optimise',
  optimized: 'optimised',
  optimization: 'optimisation',
  defense: 'defence',
  labeled: 'labelled',
  modeling: 'modelling',
  fulfill: 'fulfil',
};

/** Tokens exactos de terceros que se conservan tal como los define su propietario. */
export const ALLOWED_TOKENS: ReadonlySet<string> = new Set([
  'Authorization', // cabecera HTTP estándar
  'AUTHORIZATION', // palabra reservada de SQL
  'LICENSE', // nombre de archivo convencional
  'authorization', // nombre de la cabecera HTTP tal como la expone Node.js (en minúsculas)
]);

/** Frases de vocabulario CSS/Tailwind de terceros que se eliminan de la línea antes de analizarla. */
export const ALLOWED_PHRASES: readonly string[] = [
  'text-center',
  'items-center',
  'justify-center',
  'place-items-center',
  'self-center',
];

/** Archivos que se excluyen del análisis (rutas relativas con "/"). */
export const EXCLUDED_PATHS: readonly RegExp[] = [
  /^README\.md$/, // única excepción documental: el README principal está en español
  /^docs\/design\/source\//, // insumos originales, de solo lectura
  /^package-lock\.json$/,
  /^db\/tests\/tsqlt\/install\/.*\.(sql|txt)$/, // tSQLt vendorizado, código de terceros
  /^tools\/scripts\/lib\/spelling-rules\.ts$/,
  /^tools\/scripts\/tests\/spelling\.test\.ts$/,
  /\.(pdf|png|jpe?g|gif|ico|webp|woff2?)$/,
];

/** Extensiones cuyo contenido se analiza (los comentarios se descartan antes). */
export const SCANNED_EXTENSIONS: readonly string[] = [
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.md',
  '.yml',
  '.yaml',
  '.sh',
];
