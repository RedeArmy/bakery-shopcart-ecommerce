# CI pipeline

GitHub Actions on Linux, plus one Windows job for native dependencies and checksum normalisation. The workflow is [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## Jobs

| Job | Runs | Enabled |
|---|---|---|
| `lint` | `npm run lint`: ESLint, Prettier check, cspell (en-GB), British spelling check, README sync, SQL file names | Stage 0 |
| `typecheck` | `npm run typecheck` (`tsc --strict`) | Stage 0 |
| `unit` | `npm run test:unit` | Stage 0 |
| `architecture` | `npm run arch:check`, including the deliberate-violation self-test | Stage 0 |
| `secrets` | `gitleaks` over the full history | Stage 0 |
| `sql-lint` | `npm run sql:lint` | Stage 0 |
| `compose-validate` | `docker compose config` for the default and all profiles | Stage 0 |
| `windows-smoke` | Install and unit tests on Windows; placeholder for the CRLF checksum test | Stage 0 |
| `sql-tests` | Migrate `ShopCart_CI` from scratch, `db:verify`, tSQLt, procedure coverage | Stage 2 (`if: false` until then) |
| `integration` | Testcontainers integration and concurrency tests | Stage 2 (`if: false` until then) |

## Planned order once everything is enabled

lint → `tsc --strict` → unit tests → `dependency-cruiser` → SQL lint → migrate database in a container → `db:verify` → **tSQLt and procedure coverage** → integration and concurrency (Testcontainers) → differential TS↔SQL tests → `gitleaks` → `npm audit` → Sonar → image build → Schemathesis against the contract.

## Gates

- Any failing job blocks the merge.
- `db:verify` runs before tSQLt is installed, so the verified database never contains test code.
- A procedure that changed without raising its header `Version` fails the SQL lint.
- SonarQube (profile `quality`) targets coverage of at least 80 % on new code, no bugs, no vulnerabilities, duplication under 3 % and no unreviewed security hotspots; if the profile fails it does **not** block delivery.

## Local equivalents

```bash
npm run lint
npm run typecheck
npm test
npm run arch:check
```
