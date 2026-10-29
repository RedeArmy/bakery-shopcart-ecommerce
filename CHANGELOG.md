# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Stage 0 foundations: npm workspaces monorepo, ESLint, Prettier, cspell (en-GB), British spelling check, README sync check, commitlint, husky, `dependency-cruiser` with a deliberate-violation self-test.
- Backend skeleton: Express app factory, request id, standard error shape, zod environment validation, pino logger with redaction, `/health/live` and `/health/ready`, single stored-procedure executor, module layout.
- Frontend skeleton: Vite, React 18, router, TanStack Query, `react-i18next` with `es-GT` resources, Tailwind.
- Docker Compose stack (`db`, `db-migrate`, `backend`, `frontend`, `nginx`) with profiles `payments-sandbox`, `quality` and `observability`; multi-stage images; nginx edge with `limit_req`.
- GitHub Actions pipeline with lint, typecheck, unit, architecture, secrets, SQL lint, compose validation and a Windows smoke job.
- Stage 1 documentation: 24 ADRs, architecture, database, API, payments, quality, operations and progress documents, glossary, bilingual README.
