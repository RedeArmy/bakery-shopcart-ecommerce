# ADR-0022: Windows/Linux environment and npm run

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The developer machine may be Windows or Linux x64, and the project must run on a clean machine following only the README. `make` is not available on Windows.

## Decision

The entry point is `npm run <script>` at the repository root with npm workspaces. `.gitattributes` forces `eol=lf`, the runner normalises line endings before hashing, Docker Desktop with WSL2 is the Windows path, images use `node:26-slim` (glibc), password hashing uses `@node-rs/argon2` with a `bcryptjs` fallback, SQL Server data lives in named volumes, health checks use `mssql-tools18` with `sqlcmd -C`, and paths in scripts and compose use `/`. `npm run up` creates `.env` with generated local secrets when it is missing.

## Consequences

- CI runs on Linux plus a Windows smoke job for native dependencies and checksum normalisation.
- A Makefile may exist only as an optional shortcut.
- The runtime is Node 26, the LTS line current in October 2026 (the brief asks for Node 24 LTS or higher). It was verified on 2026-10-29 with the `node:26-slim` image: clean install, tests, production builds and the complete compose stack.

## Alternatives considered

- Make and bash scripts: not portable to Windows.

## Links

- [Design v3 §15.3 and D29](../design/source/DISENO_SHOPCART_v3.md)
