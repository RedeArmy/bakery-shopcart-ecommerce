# ADR-0018: Storage of payment proofs

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Customers upload images or PDFs as proof of deposit. These files are sensitive, untrusted and must not be reused to defraud.

## Decision

Files are stored behind `FileStoragePort` (local-disk adapter now, S3 later) in a private named volume outside any static directory, under an opaque UUID key. Metadata, MIME type, size and SHA-256 are stored in `PaymentProofs`. The type is validated by magic bytes (JPEG, PNG, PDF), not by extension or client header; the size limit is 5 MB. Download is only through the authenticated API, for the owner or an operator, with `nosniff`, `Cache-Control: private, no-store` and `Content-Security-Policy: sandbox`. If the database write fails after saving, the service removes the file and a job deletes orphan files.

## Consequences

- A proof cannot be reused in another payment (unique bank reference and file hash).
- A human decides whether the content is genuine.

## Alternatives considered

- Public bucket or static folder: exposes personal financial documents.

## Links

- [Design v3 §12.7 and D25](../design/source/DISENO_SHOPCART_v3.md)
