# Platform: database

**Responsibility:** Connection pool, the single stored-procedure executor and SQL error mapping.

**May contain:** Typed parameters and deadlock retry with random back-off.

**Must not contain:** Inline SQL of any kind.

**Governing ADR:** [0002](../../../../docs/adr/0002-critical-rules-in-stored-procedures-and-checks.md)
