# Backend integration tests

**Responsibility:** The HTTP flows of the whole API against a real SQL Server (the `integration` job of CI, or the one of the local stack; see [the tSQLt guide](../../../docs/quality/sql-testing-tsqlt.md)).

**May contain:** Stored-procedure and repository tests.

**Must not contain:** Mocked databases.

**Governing ADR:** [0023](../../../docs/adr/0023-sql-tests-with-tsqlt-in-ci-only.md)
