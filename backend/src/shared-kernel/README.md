# Shared kernel

**Responsibility:** Money, rounding, Result, AppError, the Clock port and identifiers.

**May contain:** Pure code with no I/O and no external packages.

**Must not contain:** Imports from platform or modules, file, network or database access.

**Governing ADR:** [0019](../../../docs/adr/0019-half-even-rounding-and-integer-arithmetic.md)
