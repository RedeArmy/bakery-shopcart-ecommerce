# Database: tSQLt installation

**Responsibility:** Vendored tSQLt, pinned to one version with checksums, used only by CI and by local `npm run sql:test`.

**May contain:** The unmodified files of the pinned tSQLt release and their checksums.

**Must not contain:** Edits to the vendored files, or any use outside CI (tSQLt is never installed in the delivered database).

**Governing ADR:** [0023](../../../../docs/adr/0023-sql-tests-with-tsqlt-in-ci-only.md)

## Pinned version

| Item | Value |
|---|---|
| Framework | tSQLt 1.0.8083.3529 (released 2022-02-16) |
| Licence | Apache 2.0 (the text is in `License.txt`, the original file name) <!-- spelling-ignore --> |
| Source | `https://tsqlt.org/download/tsqlt/`, which redirects to `tSQLt_V1.0.8083.3529.zip` |
| SHA-256 of the zip | `af841f357dd9189f8b197c34c5014fe0dbabd3be34b024ed46967dafe13d4f50` |

## Files

| File | Purpose |
|---|---|
| `PrepareServer.sql` | Run once per server as `sa`: enables CLR and installs the assembly key |
| `tSQLt.class.sql` | Run in the test database: installs the framework |
| `License.txt` | Apache 2.0 licence text, kept as required by the licence <!-- spelling-ignore --> |
| `SHA256SUMS` | Checksums of the three files above |

The files are stored byte for byte, with Windows (CRLF) line endings: `.gitattributes` marks them as `-text` so Git never converts them and the checksums are identical on Windows and Linux. `npm run sql:lint` verifies them against `SHA256SUMS`, so an edited or corrupted file fails the build.

## Why they are excluded from some checks

They are third-party generated code, so the spell check and the British spelling check skip the `.sql` and `.txt` files (`cspell.json` and `tools/scripts/lib/spelling-rules.ts`). The secret scan does **not** skip them: gitleaks 8.24.3 scans the files and reports nothing. SonarCloud analyses only the folders listed in `sonar.sources`, which do not include this one.

## How to upgrade

1. Download the new release from the official address above and read its release notes.
2. Replace the three files without editing them and regenerate `SHA256SUMS` with `sha256sum`.
3. Update the version table in this file and the spike result in [the tSQLt testing document](../../../../docs/quality/sql-testing-tsqlt.md).
4. Run `npm run sql:test` against a clean SQL Server container before opening the pull request.
