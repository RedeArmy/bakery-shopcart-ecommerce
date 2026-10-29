# Database: stored procedures

**Responsibility:** Procedures named SP_<Module>_<Process>; the only way the application touches data.

**May contain:** One procedure per file with typed parameters.

**Must not contain:** String-concatenated SQL.

**Governing ADR:** [0002](../../../docs/adr/0002-critical-rules-in-stored-procedures-and-checks.md)
