# Module: auth

**Responsibility:** Registration, login, JWT access tokens and rotating refresh tokens delivered in an `HttpOnly` cookie, with the body also accepted and taking precedence (light treatment).

**May contain:** The four layer folders and the module public surface (index.ts).

**Must not contain:** Imports of other modules except through their index.ts.

**Governing ADR:** [0001](../../../../docs/adr/0001-modular-monolith-with-vertical-slices.md)
