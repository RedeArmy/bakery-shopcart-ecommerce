# Backend concurrency tests

**Responsibility:** Parallel scenarios: last unit of stock, coupon limits, duplicate approvals.

**May contain:** Tests that open many simultaneous connections.

**Must not contain:** Sequential tests.

**Governing ADR:** [0023](../../../docs/adr/0023-sql-tests-with-tsqlt-in-ci-only.md)
