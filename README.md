# ShopCart · Pastelería

🇬🇧 English version: [README.en.md](README.en.md)

Plataforma de comercio electrónico de nivel productivo para una pastelería, construida para el **Tech Challenge 360 · Reto ShopCart (Grupo Pentandra)**. Incluye catálogo, carrito, cupones, checkout con reserva de existencias durante 15 minutos, pago por **depósito bancario** simulado de punta a punta (comprobante, revisión, rechazo y reintento), pedidos y devoluciones, tablero de ventas y bitácora de auditoría.

Stack obligatorio: **SQL Server 2019+ (solo procedimientos almacenados) · Node 26 + TypeScript `strict` + Express · React 18 + TypeScript**. Fechas de entrega: **Fase 1 (base de datos y backend) lunes 2 de noviembre de 2026, 23:59** y **Fase 2 (frontend y proyecto completo) lunes 9 de noviembre de 2026, 23:59**.

**Estado:** la Fase 1 está completa y se puede verificar en minutos con una colección de Postman (sección 8). El frontend es de la Fase 2 y todavía no está hecho (sección 14).

## 1. El escenario

Una cadena de tiendas vende solo en sus puntos físicos y quiere vender en línea. Los clientes navegan el catálogo (pasteles, cupcakes, galletas, pan dulce, postres fríos y temporada), arman su carrito, aplican cupones, eligen dirección y fecha de entrega, pagan y siguen su pedido. El equipo interno prepara y despacha los pedidos, controla las existencias y analiza las ventas. Los montos son en quetzales y los precios publicados incluyen el IVA del 12 %.

El negocio tiene seis preocupaciones concretas y cada una tiene un mecanismo:

| Preocupación | Mecanismo |
|---|---|
| No vender la última unidad dos veces | `UPDATE` condicional atómico más `CHECK (ReservedStock <= OnHandStock)` |
| Respetar el precio que el cliente vio | Copia del precio en `OrderLines` y triggers de inmutabilidad |
| Sin pedidos ni cobros duplicados | `Idempotency-Key` más índices únicos |
| Ventas y abandonos sin reportes manuales | Vistas y funciones de tabla |
| Trazabilidad de cambios | `AuditLog` escrito dentro de cada procedimiento |
| Trazabilidad de inventario | Libro de movimientos con saldo resultante |

## 2. Cobertura de requisitos

Los nueve módulos del enunciado están construidos en la base de datos y el backend. Lo que falta de cada uno es solo su pantalla, que pertenece a la Fase 2.

| Requisito | Fase 1 (base de datos y API) | Dónde se resuelve |
|---|---|---|
| RF-01 Autenticación y roles | Completo | [Seguridad](docs/architecture/05-security.md) |
| RF-02 Catálogo | Completo | [Catálogo de procedimientos](docs/database/stored-procedure-catalogue.md) |
| RF-03 Inventario y kardex | Completo | [ADR-0007](docs/adr/0007-stock-reservation-as-expiring-counter.md) |
| RF-04 Carrito | Completo | [ADR-0013](docs/adr/0013-cart-with-absolute-quantities.md) |
| RF-05 Cupones | Completo | [Catálogo de procedimientos](docs/database/stored-procedure-catalogue.md) |
| RF-06 Checkout y pago | Completo (pago simulado) | [Pagos](docs/payments/overview.md) |
| RF-07 Pedidos y devoluciones | Completo | [Máquinas de estado](docs/architecture/04-state-machines.md) |
| RF-08 Tablero y reportes | Completo (las gráficas son de la Fase 2) | [ADR-0009](docs/adr/0009-definition-of-completed-order-for-reports.md) |
| RF-09 Bitácora | Completo | [Modelo de datos](docs/database/er-diagram.md) |

Los 21 criterios de aceptación del enunciado están en el [mapa de criterios](docs/quality/acceptance-criteria-map.md): para cada uno dice qué lo hace cumplir y qué prueba lo demuestra. Las pruebas son 627 de base de datos (tSQLt), 16 escenarios de concurrencia con conexiones reales, 22 flujos HTTP contra SQL Server y más de 550 pruebas unitarias.

## 3. Arquitectura

Monolito modular con cortes verticales; dentro de cada módulo la regla de dependencia es `presentation → application → domain ← infrastructure` y `dependency-cruiser` la verifica en CI.

```mermaid
flowchart LR
  B[Browser<br/>React 18] --> N[nginx<br/>limit_req]
  N --> F[frontend<br/>static files]
  N --> A[backend<br/>Express TS]
  A -->|typed stored procedures| DB[(SQL Server)]
  A --> V[(payment proofs volume)]
  M[db-migrate<br/>V/R/S runner] --> DB
```

**Cómo se organizan los controladores y las rutas.** Cada módulo de `backend/src/modules/<módulo>/` tiene las mismas cuatro carpetas, y una petición las recorre en orden:

| Capa | Dónde | Qué hace |
|---|---|---|
| Rutas y controladores | `presentation/*.routes.ts` | Valida el cuerpo con zod, aplica seguridad, límite de tasa e idempotencia, llama al puerto y arma la respuesta. No tiene lógica de negocio |
| Aplicación | `application/` | Los puertos (interfaces) que la capa de presentación usa |
| Dominio | `domain/` | Reglas puras, sin Express ni SQL |
| Infraestructura | `infrastructure/sql-*-repository.ts` | Único lugar que llama a un procedimiento almacenado, con parámetros tipados |

Ejemplo, `PUT /api/v1/cart/items/{id}`: `cart.routes.ts` valida la cantidad (1 a 99) y toma el usuario del token, llama a `CartRepository.setItem` y `sql-cart-repository.ts` ejecuta `SP_Cart_SetItemQuantity`, que es quien comprueba la existencia. Todo se une en un solo lugar, `backend/src/composition-root.ts`. La lógica que necesita ser atómica vive en los procedimientos almacenados ([ADR-0002](docs/adr/0002-critical-rules-in-stored-procedures-and-checks.md)); el backend orquesta y nunca calcula importes.

El contrato está en [docs/api/openapi/openapi.yaml](docs/api/openapi/openapi.yaml) y tiene **89 operaciones**:

| Módulo | Operaciones | Módulo | Operaciones |
|---|---|---|---|
| Autenticación | 9 | Pedidos | 8 |
| Catálogo (público y administración) | 15 | Pagos, depósitos y reembolsos | 16 |
| Carrito | 6 | Inventario | 3 |
| Direcciones | 3 | Cupones | 4 |
| Checkout | 3 | Usuarios | 2 |
| Bitácora y sistema | 4 | Tablero | 5 |
| Salud | 2 | Sucursales | 5 |
| Métodos de pago | 4 | | |

Más detalle en [docs/architecture](docs/architecture/01-system-overview.md) y en los diagramas [C4](docs/architecture/c4/context.md).

## 4. Decisiones técnicas

Las decisiones están registradas como ADR (25 en total). Las que dan forma a todo:

| Decisión | ADR |
|---|---|
| Monolito modular con cortes verticales | [0001](docs/adr/0001-modular-monolith-with-vertical-slices.md) |
| Las reglas críticas viven en procedimientos y `CHECK` | [0002](docs/adr/0002-critical-rules-in-stored-procedures-and-checks.md) |
| Runner de migraciones propio, solo hacia adelante | [0003](docs/adr/0003-own-forward-only-migration-runner-in-node.md) |
| Idempotencia en dos niveles | [0004](docs/adr/0004-idempotency-at-two-levels.md) |
| El servidor nunca cobra tarjetas | [0005](docs/adr/0005-server-never-takes-cards.md) |
| El pedido nace en `PendingPayment` | [0014](docs/adr/0014-order-created-as-pending-payment.md) |
| Redondeo half-even y aritmética entera | [0019](docs/adr/0019-half-even-rounding-and-integer-arithmetic.md) |
| Importes como cadenas decimales en la API | [0020](docs/adr/0020-amounts-as-decimal-strings-in-the-api.md) |
| Inglés británico en todo, comentarios en español | [0024](docs/adr/0024-language-and-spelling-conventions.md) |

## 5. Decisiones abiertas y supuestos

El enunciado deja algunas decisiones a propósito. Estas son las posturas tomadas; el registro completo está en [decision-log](docs/progress/decision-log.md) y [open-questions](docs/progress/open-questions.md).

| Tema | Qué se decidió |
|---|---|
| Pasarela de pagos | No hay pasarela. El pago es un **depósito bancario** simulado: el cliente sube el comprobante, el personal lo revisa y lo aprueba (éxito) o lo rechaza con un motivo (rechazo), y el cliente abre otro intento, hasta tres (reintento). El código de tarjeta queda inactivo por defecto |
| Existencias y reserva | Al iniciar el pago se reservan las unidades 15 minutos. El pedido se crea en una sola transacción que toma la reserva; el movimiento de salida del kardex se escribe cuando se aprueba el pago ([ADR-0007](docs/adr/0007-stock-reservation-as-expiring-counter.md)). Un pedido abandonado no deja ruido en el kardex |
| Devoluciones | Totales o parciales por línea, **varias por pedido**. Las registra el operador o el administrador; el cliente no. El enunciado no define un plazo de devolución y no se inventó uno |
| Cancelación | Mientras el pedido no se haya despachado. Libera la reserva o devuelve las unidades al kardex y deja un reembolso pendiente |
| IVA | 12 % incluido en el precio; cada pedido guarda la base imponible y el IVA |
| Zona horaria | Guatemala (UTC-6). Los reportes agrupan por la fecha de pago en hora local |
| Cuentas de personal | No se crean por la API: se siembran. El registro público solo crea clientes, para que un error no pueda crear un administrador |
| Sesión | Access token JWT de 15 minutos; refresh token opaco con rotación y detección de reutilización, entregado en una cookie `HttpOnly; SameSite=Strict` (el cuerpo lo repite para Postman); bloqueo progresivo de la cuenta |
| Dinero | `DECIMAL(18,2)` en tablas, `BIGINT` en centavos en los cálculos, redondeo half-even una sola vez y cadenas decimales en la API |

**Estándar de nomenclatura.** El enunciado define el formato (`SP_Módulo_Proceso`, `VW_`, `FU_`, llaves `ID<Entidad>`, primera letra de cada palabra en mayúscula) y da ejemplos en español, como `SP_Pedidos_CrearPedido`. Se cumple el formato en todos los objetos, y los nombres están en inglés británico por decisión del equipo ([ADR-0024](docs/adr/0024-language-and-spelling-conventions.md)): `SP_Orders_CreateOrder`, `IDProduct`. El [glosario](docs/glossary.md) da la equivalencia de cada término del enunciado.

## 6. Modelo de datos y ciclo de vida

El diagrama completo y el orden de migraciones están en [docs/database/er-diagram.md](docs/database/er-diagram.md). La base tiene 41 tablas, 97 procedimientos almacenados, 20 funciones de tabla, 6 vistas y 11 triggers. Resumen de las relaciones principales:

```mermaid
erDiagram
  Users ||--o{ Orders : places
  Orders ||--o{ OrderLines : contains
  Orders ||--o{ Payments : "is paid with"
  Payments ||--o{ PaymentProofs : supports
  Variants ||--o{ OrderLines : "is sold as"
  Variants ||--o{ InventoryMovements : ledger
  Orders ||--o{ FinancialMovements : "money ledger"
```

Ciclo de vida del pedido (el del pago está en [docs/architecture/04-state-machines.md](docs/architecture/04-state-machines.md)). Las transiciones permitidas son filas de la tabla `OrderStatusTransitions`: un trigger rechaza cualquier otra, aunque falle el backend. Varias devoluciones parciales dejan el pedido en `PartiallyReturned`; cuando ya no queda nada por devolver pasa a `Returned`.

```mermaid
stateDiagram-v2
  [*] --> PendingPayment
  PendingPayment --> Paid
  PendingPayment --> Cancelled
  Paid --> InPreparation
  Paid --> Cancelled
  InPreparation --> Dispatched
  InPreparation --> Cancelled
  Dispatched --> Delivered
  Delivered --> PartiallyReturned
  Delivered --> Returned
  PartiallyReturned --> PartiallyReturned
  PartiallyReturned --> Returned
```

## 7. Inicio rápido: de cero a una prueba completa

Siga los pasos en orden. Todo el recorrido toma unos 15 minutos la primera vez, casi todo construyendo las imágenes.

**1. Requisitos.** Node.js 26, Git y Docker: Docker Desktop abierto (Windows con WSL2) o Docker Engine con el plugin compose (Linux). Compruébelos:

```bash
node -v
docker info
```

**2. Descargar e instalar.**

```bash
git clone https://github.com/RedeArmy/bakery-shopcart-ecommerce.git
cd bakery-shopcart-ecommerce
npm ci
```

Si `npm` no funciona en PowerShell de Windows (por ejemplo, «la ejecución de scripts está deshabilitada»), use `npm.cmd` y `npx.cmd` en lugar de `npm` y `npx` en todos los comandos de esta guía, por ejemplo `npm.cmd ci` y `npm.cmd run up`; o use Git Bash, donde `npm` funciona sin cambios.

**3. Levantar el entorno.**

```bash
npm run up
```

Crea `.env` con secretos locales generados si no existe, construye las imágenes, aplica las migraciones y las semillas (incluidas las cuentas de prueba) y espera a que los servicios estén saludables. Los servicios son `db`, `db-migrate`, `backend`, `frontend` y `nginx`.

**4. Comprobar que está vivo.** Abra estas direcciones en el navegador:

| Dirección | Respuesta esperada |
|---|---|
| `http://localhost:8080/health/ready` | 200: la base de datos responde y el esquema está al día |
| `http://localhost:8080/api/v1/categories` | 200: lista pública, vacía hasta que se cree el catálogo |
| `http://localhost:8080/` | El marcador de la tienda (la interfaz llega en la Fase 2) |

`/api/v1` por sí sola no existe y responde 404 `ROUTE_NOT_FOUND`: la API tiene solo rutas concretas.

**5. Obtener las contraseñas.** Abra el archivo `.env` de la raíz y copie `SEED_ADMIN_PASSWORD` y `SEED_CUSTOMER_PASSWORD`. Se generan al azar en cada equipo y no están en el repositorio ([credenciales](#10-credenciales-de-prueba)).

**6. Probar con Postman.** La carpeta [docs/api/postman](docs/api/postman/README.md) trae la colección en español, la misma en inglés y un entorno:

1. En Postman, importe `ShopCart.postman_collection.es.json` y `ShopCart.local.postman_environment.json`.
2. Elija el entorno **ShopCart · local** y pegue las dos contraseñas en la columna **Current value** de `adminPassword` y `customerPassword`.
3. Abra la colección, pulse **Run** y deje el orden de las carpetas. Resultado esperado: 38 peticiones, 66 aserciones, 0 fallos.

Cada ejecución crea sus propios datos, así que se puede repetir; espere un minuto entre ejecuciones porque el inicio de sesión admite cinco intentos por minuto.

**7. O desde una terminal**, sin Postman (unos 50 segundos; para la colección en español cambie el archivo por `ShopCart.postman_collection.es.json`):

```bash
npx newman run docs/api/postman/ShopCart.postman_collection.json -e docs/api/postman/ShopCart.local.postman_environment.json --env-var "adminPassword=<SEED_ADMIN_PASSWORD>" --env-var "customerPassword=<SEED_CUSTOMER_PASSWORD>"
```

**8. Detener.**

```bash
npm run down
```

Para empezar de cero, incluida la base de datos, use `docker compose down --volumes`, borre `.env` y repita desde el paso 3. Perfiles opcionales: `quality` (SonarQube) y `observability`. Más ayuda en el [runbook](docs/operations/runbook.md) y en [Windows y Linux](docs/operations/environment-windows-linux.md).

| Si ve esto | Qué significa y cómo se arregla |
|---|---|
| `db` queda «unhealthy» y el log dice `Login failed for user 'sa'` | Un volumen de una ejecución anterior guarda otra contraseña. Ejecute `docker compose down --volumes` y vuelva al paso 3 |
| `429 Too Many Requests` al iniciar sesión | Se usaron los cinco intentos por minuto. Espere un minuto |
| `401` al iniciar sesión como administrador | La contraseña pegada no es la del `.env` actual |
| `503` en `/health/ready` | Las migraciones no han terminado. Revise `docker compose logs db-migrate` |
| El puerto 8080 está ocupado | Cambie `EDGE_PORT` en `.env` y `baseUrl` en el entorno de Postman |
| Error de collation o `SERVER_SHUT_DOWN` | Volumen antiguo: `docker compose down --volumes` |

## 8. Cómo verificar la entrega

**Con la colección de Postman.** Las 38 peticiones son las mínimas que prueban la entrega, y la primera carpeta que importa es la de **autenticación**: registra un cliente, inicia sesión, lee el perfil, rechaza un token ausente y una contraseña incorrecta, y comprueba la rotación del refresh token. Las demás recorren el catálogo, el carrito, los cupones, el checkout con su idempotencia, la propiedad de los datos, el ciclo de vida del pedido y la bitácora. La tabla de qué prueba cada carpeta está en el [README de Postman](docs/api/postman/README.md) y el mapa de cada criterio de la prueba en el [mapa de criterios de aceptación](docs/quality/acceptance-criteria-map.md). Para explorar las 89 operaciones, importe `docs/api/openapi/openapi.yaml` en Postman: genera una petición por operación.

**Con las pruebas automáticas.** Las pruebas de base de datos y de concurrencia corren contra un SQL Server desechable:

| Qué se prueba | Comando |
|---|---|
| Unitarias del backend, del runner y de los scripts | `npm test` |
| 627 pruebas de base de datos (tSQLt) | `npm run sql:test:up` y después `npm run sql:test` |
| 16 escenarios de concurrencia con conexiones reales | `npm run sql:concurrency` |
| Flujos HTTP contra SQL Server (22) | `npm run test:integration -w backend`, con el servidor de pruebas migrado ([comandos](docs/quality/sql-testing-tsqlt.md#concurrency-http-and-performance-suites)) |
| Cobertura de procedimientos por pruebas (97 de 97) | `npm run sql:coverage` |
| Tiempos de listados y reportes con 50 000 pedidos | `npm run sql:bench` |

## 9. Comandos

| Comando | Qué hace |
|---|---|
| `npm run up` / `down` / `logs` | Levanta, detiene y sigue los logs del entorno |
| `npm run lint` | ESLint, Prettier, cspell, ortografía británica, sincronía de README y nombres SQL |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Pruebas unitarias de todos los paquetes |
| `npm run arch:check` | Reglas de dependencias y su autoprueba |
| `npm run db:migrate` / `db:verify` / `seed` | Migraciones, verificación de deriva y cuentas de demostración |
| `npm run sql:lint` / `sql:test` / `sql:coverage` | Lint SQL, pruebas tSQLt y cobertura de procedimientos |
| `npm run sql:test:up` / `sql:test:down` | Levanta y apaga el SQL Server desechable de las pruebas |
| `npm run sql:concurrency` / `sql:bench` | Escenarios de concurrencia y banco de rendimiento |
| `npm run api:generate` / `sonar` | Cliente TypeScript desde OpenAPI (Fase 2) y análisis de calidad opcional; aún no implementados |

## 10. Credenciales de prueba

Las cuentas de prueba las crea el paso de semilla de `db-migrate` cuando `SEED_DEMO_DATA` es `true`, que es lo que deja `npm run up`. Los correos usan el dominio reservado `.test` y no son secretos:

| Rol | Correo |
|---|---|
| Administrador | `admin@shopcart.test` |
| Operador | `operator@shopcart.test` |
| Cliente | `customer1@shopcart.test` y `customer2@shopcart.test` |

Las contraseñas **no están en el repositorio**: `npm run up` las genera al azar en su archivo `.env` local, en las variables `SEED_ADMIN_PASSWORD`, `SEED_OPERATOR_PASSWORD` y `SEED_CUSTOMER_PASSWORD` (los dos clientes comparten la última), y la base de datos solo guarda su hash argon2id. Para obtener contraseñas nuevas, detenga el entorno con `docker compose down --volumes`, borre `.env` y ejecute `npm run up` otra vez. Más detalle en [docs/operations/test-accounts.md](docs/operations/test-accounts.md).

## 11. Pagos

El pago es un **depósito bancario** que se simula de punta a punta, sin pasarela. El cliente confirma el pedido y elige una cuenta bancaria; tiene una ventana para pagar y sube el comprobante (JPEG, PNG o PDF de hasta 5 MB, validado por sus bytes iniciales). El pago pasa por estos estados:

| Estado del pago | Qué significa |
|---|---|
| `Pending` | Esperando el comprobante |
| `UnderReview` | Comprobante recibido; el personal lo revisa |
| `Approved` | **Éxito:** el pedido pasa a `Paid` y la existencia sale del kardex |
| `Rejected` | **Rechazo:** con motivo; el cliente puede abrir otro intento, hasta tres |
| `Expired` | La ventana terminó sin pago: el pedido se cancela y la reserva se libera sola |

La regla de cuándo se ofrece el depósito según la fecha de entrega está en [payments/availability-rule](docs/payments/availability-rule.md) y el flujo completo en [payments/bank-deposit](docs/payments/bank-deposit.md). El pago con tarjeta (Recurrente) no se requiere para esta entrega: basta simular el pago. Su código existe pero queda inactivo mientras no haya credenciales, y sin ellas solo se ofrece el depósito, tanto en la interfaz como en el backend (`422 PAYMENT_METHOD_UNAVAILABLE`).

## 12. Mapa del repositorio

| Ruta | Contenido |
|---|---|
| `backend/` | API Express + TypeScript organizada por módulos |
| `frontend/` | React 18 + Vite + Tailwind |
| `db/` | Migraciones `V`, objetos `R`, semillas `S`, pruebas tSQLt, banco de rendimiento, lint y runner |
| `docker/`, `docker-compose.yml` | nginx, inicialización de SQL Server y perfiles |
| `docs/` | ADR, arquitectura, base de datos, API (con la colección de Postman), pagos, calidad, operación y avance |
| `tools/` | Scripts de verificación y simulador de Recurrente |

## 13. Documentación

Índice completo en [docs/README.md](docs/README.md). Contrato de la API en [docs/api/openapi/openapi.yaml](docs/api/openapi/openapi.yaml). Mapa de criterios de aceptación en [docs/quality/acceptance-criteria-map.md](docs/quality/acceptance-criteria-map.md). Rendimiento de la base de datos en [docs/operations/performance.md](docs/operations/performance.md). Guía de colaboración en [CONTRIBUTING.md](CONTRIBUTING.md) y política de seguridad en [SECURITY.md](SECURITY.md).

## 14. Estado de la entrega

**Fase 1, base de datos y backend: completa.** 17 migraciones, 97 procedimientos, la API de 89 operaciones, la autenticación con rotación de tokens, el pago simulado, los trabajos de fondo (vencimiento de reservas y pagos, purga de datos, conciliación de importes y existencias) y las pruebas descritas en la sección 8. El historial de cambios y las decisiones están en [STATUS](docs/progress/STATUS.md) y [ROADMAP](docs/progress/ROADMAP.md).

**Datos de demostración.** Al levantar el entorno existen las cuatro cuentas de prueba y una tienda pequeña: 60 productos en 6 categorías (97 variantes y 2 230 unidades, tres agotadas a propósito), los cupones `WELCOME10`, `CAKES25`, `SOLDOUT` y `EXPIRED`, dos cuentas bancarias ficticias y dos sucursales para recoger pedidos. Se crean por los procedimientos reales y repetir el paso no duplica nada ([detalle y cómo ver cada mensaje de cupón](docs/operations/demo-data.md)). La colección de Postman sigue creando sus propios datos.

**Fase 2, frontend: pendiente.** Rutas protegidas y menús por rol, formularios con validación, tablas con paginación y filtros del lado del servidor, gráficas del tablero, estados de carga, vacío y error, renovación transparente del token e interfaz responsive, con pruebas de extremo a extremo.
