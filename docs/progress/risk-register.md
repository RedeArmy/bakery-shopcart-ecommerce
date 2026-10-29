# Risk register

Probability and impact: L low, M medium, H high.

| # | Risk | P | I | Mitigation | Owner |
|---|---|---|---|---|---|
| 1 | tSQLt needs CLR and may not install on the Linux SQL Server image or Docker Desktop with WSL2 | M | M | Day-one spike in Stage 2. Plan B: Vitest tests through `executeProcedure` with the same assertions; never ship tSQLt in the delivered database | Lead engineer |
| 2 | Recurrente details are unverified (`expires_at`, refund payload, closing a checkout, reuse after failure) and the sandbox sends no webhooks | M | M | Design does not depend on them: return verification and a reconciliation job; simulator for demos; validate with test keys on the first day of Stage 8 | Lead engineer |
| 3 | The calendar is tight: Phase 1 in five days, Phase 2 seven days later | H | H | Strict stage order; extras only when the mandatory scope is closed; tooling after critical procedures and their tests; freeze Phase 1 with hours to spare | Lead engineer |
| 4 | SQL Server consumes too much memory on small laptops | M | M | `MSSQL_MEMORY_LIMIT_MB` defaults to 2048; documented minimum of 4 GB for Docker Desktop | Lead engineer |
| 5 | Windows line endings change script bytes and break checksums | M | H | `.gitattributes` `eol=lf`, runner normalises CRLF to LF before hashing, Windows smoke job, `git add --renormalize` in the runbook | Lead engineer |
| 6 | An evaluator may expect Spanish object names, as in the brief's examples | L | M | The brief fixes patterns, not language; ADR-0024 records the decision; the glossary maps every term; renaming would be mechanical | Lead engineer |
| 9 | Half-even rounding surprises customers or conflicts with future fiscal invoicing | L | M | Single function, ADR-0019, documented trade-off; revisit if FEL is added | Lead engineer |
| 10 | In-memory rate limiting doubles its limit across two replicas | L | L | nginx coarse cap and database lockout compensate; Redis adapter optional | Lead engineer |
