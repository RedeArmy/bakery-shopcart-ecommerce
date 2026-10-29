# Environment: Windows and Linux x64

The official SQL Server image runs natively on x64 without emulation ([ADR-0022](../adr/0022-windows-linux-environment-and-npm-run.md)).

| Topic | Decision |
|---|---|
| Docker on Windows | Docker Desktop with the **WSL2** backend. Give it at least **4 GB** of RAM (SQL Server needs a minimum of 2 GB) and set `MSSQL_MEMORY_LIMIT_MB` |
| **Line endings and checksums** | With `core.autocrlf` on Windows the same script changes bytes. `.gitattributes` (`* text=auto eol=lf`) **and** the runner normalising `CRLF → LF` before hashing (with a test) solve it |
| Command entry point | **`npm run` at the root**: `up`, `down`, `test`, `lint`, `db:migrate`, `db:verify`, `sql:test`, `sql:coverage`, `seed`, `sonar`. `make` does not ship with Windows; a Makefile may exist only as an optional shortcut on Linux |
| Migration runner | **Node and TypeScript with the `mssql` package**, without `sqlcmd` or bash |
| Node base image | `node:24-slim` (glibc) instead of Alpine, to avoid problems with native binaries |
| Password hashing | `@node-rs/argon2` (prebuilt binaries, no compiler on Windows). Fallback: `bcryptjs`. Verified by an install test in CI |
| SQL Server data | **Named** Docker volume, not a bind mount, to avoid permission and performance problems on Windows |
| Paths | Always `/`, no absolute Windows paths in scripts or `docker-compose.yml` |
| Health checks | `mssql-tools18` with `sqlcmd -C` (trusts the development certificate) |

## Prerequisites

- Node.js 24 LTS (`.nvmrc` pins it) and npm.
- Docker Desktop (Windows, with WSL2) or Docker Engine with the compose plugin (Linux).
- Git, with no special `core.autocrlf` requirements.

## First run

```bash
npm install
npm run up
```

Then open `http://localhost:8080`. See the [runbook](runbook.md) for troubleshooting.

## Image practices

Multi-stage builds, non-root users, `.dockerignore`, pinned image versions, `HEALTHCHECK` and graceful shutdown (drains requests on `SIGTERM`).
