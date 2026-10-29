# ADR-0024: Language and spelling conventions

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The design is written in Spanish, the evaluators read Spanish, the shop serves Guatemalan customers, and the brief gives Spanish examples for object names while fixing only the prefixes and patterns. The team wants a consistent, machine-checkable convention.

## Decision

British English (en-GB, `-ise` forms) for everything except code comments: identifiers, files and folders, database objects, API paths and JSON fields, error codes, environment variables, Docker services, npm scripts, branches, commits and documents. Code comments, including those in SQL, YAML, Dockerfile, `.env.example`, nginx and shell files, are Spanish and explain the why. The shop UI is Spanish (`es-GT`) and lives only in i18n resource files with British English keys; seed catalogue content is Spanish data. API errors carry a stable English `code` and a short English `message`; the frontend maps `code` to Spanish text. Third-party and protocol spellings stay as their owner defines them (the `Authorization` header, CSS `color`, `normalize()`, the Recurrente key `canceled`) and are isolated in adapters. The root `README.md` is Spanish and `README.en.md` is its British English twin; it is the only document exception. Enforcement: `cspell` with the en-GB dictionary (comments excluded), `tools/scripts/check-british-spelling.ts` with a deny-list of US spellings and an allow-list for the exceptions, and `tools/scripts/check-readme-sync.ts`, all part of `npm run lint` and CI. <!-- spelling-ignore -->

## Consequences

- The Spanish design terms are translated through `docs/glossary.md`; the original stays untouched in `docs/design/source/`.
- An evaluator may expect Spanish object names; the risk is recorded in the risk register and the glossary maps every term.
- A line can opt out of the spelling check with the marker `spelling-ignore` when it must quote a third-party spelling.

## Alternatives considered

- Spanish identifiers (as in the design): conflicts with the engineering convention chosen for the codebase.
- American English: the team chose British English.

## Links

- [Design v3 §1.2](../design/source/DISENO_SHOPCART_v3.md)
- [glossary](../glossary.md)
