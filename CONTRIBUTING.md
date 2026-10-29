# Contributing

Thank you for helping. This guide explains how work flows through the repository. The rules are summarised in [docs/quality/definition-of-done.md](docs/quality/definition-of-done.md) and in the ADRs.

## Setup

```bash
npm install
npm run up
```

Husky installs the Git hooks on `npm install`: `pre-commit` runs Prettier and ESLint over staged files and `commit-msg` validates the message.

## Branches and commits

- Branches: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) **in English**: `feat(orders): add partial return`, `fix(inventory): release expired reservations once`.
- Keep commits small and progressive; the evaluator reads the history.
- Never force-push, reset hard or skip hooks.

## Language rules (ADR-0024)

1. **British English** for everything except code comments: identifiers, file names, database objects, API paths, JSON fields, error codes, environment variables, Docker services, npm scripts, branches, commit messages and documents. Use `-ise` forms.
2. **Code comments are Spanish** and explain the why.
3. **Shop UI text is Spanish (`es-GT`)** in i18n resource files; keys are British English.
4. The root `README.md` is Spanish; `README.en.md` mirrors it. Everything else is British English.
5. Third-party spellings stay as their owner defines them and live in adapters. A line may carry the marker `spelling-ignore` when it has to quote one.

`npm run spell`, `npm run lint:spelling` and `npm run lint:readme` check these rules, and `npm run lint` runs all of them.

## Architecture rules

- Database access only through stored procedures; no ORM and no inline SQL.
- Money is never floating point: `DECIMAL(18,2)`, `BIGINT` cents, half-even rounding, decimal strings in the API.
- Modules are imported only through their `index.ts`; `npm run arch:check` enforces the layers.
- Contract first: change `docs/api/openapi/openapi.yaml` before the code.
- Applied migrations (`V####`) are immutable; a changed object (`R####`) raises its header version.

## Pull requests

`main` is protected by a ruleset: no direct pushes and no merges without a pull request whose checks, including SonarCloud, all pass. See [docs/operations/branch-protection-and-sonarcloud.md](docs/operations/branch-protection-and-sonarcloud.md).

## Making a change

1. Read the ADR that governs the area and the README of the folder you are changing.
2. Write or update the tests first when you can (unit, integration, concurrency, tSQLt).
3. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run arch:check`.
4. Update the documents you touched and `docs/progress/STATUS.md` at the end of the session.
5. Record architectural decisions as an ADR (copy `docs/adr/0000-template.md`) and a line in `docs/progress/decision-log.md`.

## Definition of done

See [docs/quality/definition-of-done.md](docs/quality/definition-of-done.md). A pull request uses the template in `.github/pull_request_template.md`.
