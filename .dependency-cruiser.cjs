// Reglas de dependencias del backend (sección 5 del prompt maestro y ADR-0001).
// Las rutas son relativas a la raíz del repositorio: backend/src/...
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Las dependencias circulares impiden razonar sobre las capas.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'Un módulo solo puede importar a otro a través de su index.ts (su superficie pública).',
      from: { path: '^backend/src/modules/([^/]+)/' },
      to: {
        path: '^backend/src/modules/[^/]+/',
        pathNot: ['^backend/src/modules/$1/', '^backend/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'domain-not-to-outer-layers',
      severity: 'error',
      comment: 'El dominio no depende de application, infrastructure ni presentation.',
      from: { path: '^backend/src/modules/[^/]+/domain/' },
      to: { path: '^backend/src/modules/[^/]+/(application|infrastructure|presentation)/' },
    },
    {
      name: 'domain-no-frameworks',
      severity: 'error',
      comment: 'El dominio no importa Express, mssql ni zod.',
      from: { path: '^backend/src/modules/[^/]+/domain/' },
      to: { path: '(^|/)node_modules/(express|mssql|zod)(/|$)' },
    },
    {
      name: 'application-not-to-adapters',
      severity: 'error',
      comment: 'La capa de aplicación depende de puertos, nunca de infrastructure ni presentation.',
      from: { path: '^backend/src/modules/[^/]+/application/' },
      to: { path: '^backend/src/modules/[^/]+/(infrastructure|presentation)/' },
    },
    {
      name: 'presentation-not-to-infrastructure',
      severity: 'error',
      comment: 'Presentation invoca casos de uso; no conoce los adaptadores.',
      from: { path: '^backend/src/modules/[^/]+/presentation/' },
      to: { path: '^backend/src/modules/[^/]+/infrastructure/' },
    },
    {
      name: 'execute-procedure-only-from-infrastructure',
      severity: 'error',
      comment: 'Solo infrastructure (y la propia plataforma de datos) llama a execute-procedure.',
      from: {
        pathNot: ['^backend/src/modules/[^/]+/infrastructure/', '^backend/src/platform/db/'],
      },
      to: { path: '^backend/src/platform/db/execute-procedure\\.ts$' },
    },
    {
      name: 'shared-kernel-no-io',
      severity: 'error',
      comment:
        'El shared-kernel es puro: sin E/S, sin paquetes externos ni dependencia de otras capas.',
      from: { path: '^backend/src/shared-kernel/' },
      to: {
        dependencyTypes: ['core', 'npm', 'npm-dev', 'npm-peer', 'npm-optional', 'npm-unknown'],
      },
    },
    {
      name: 'shared-kernel-not-to-app',
      severity: 'error',
      comment: 'El shared-kernel no conoce plataforma ni módulos.',
      from: { path: '^backend/src/shared-kernel/' },
      to: { path: '^backend/src/(platform|modules)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js', '.json'],
    },
  },
};
