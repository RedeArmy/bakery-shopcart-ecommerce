# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Contact the maintainer privately through the e-mail address on the Git commit history and include the affected component, steps to reproduce and the impact. You can expect an acknowledgement within three working days.

## Supported versions

This is a challenge project under active development; only the latest commit of the default branch is supported.

## Security model in brief

- Passwords are hashed with argon2id; access tokens live 15 minutes; refresh tokens are opaque, stored as SHA-256 hashes, rotated on every use and revoked as a family on reuse.
- A customer can never read or change another customer's data (the response is 404), including payment proofs.
- All database access goes through stored procedures with typed parameters; the application login cannot read or write tables directly.
- Uploads are validated by magic bytes, stored privately and downloaded only through the authenticated API.
- Webhook signatures are verified in constant time with a replay tolerance.
- No secrets are committed; `gitleaks` runs in CI and `.env.example` has empty values.

The full model is in [docs/architecture/05-security.md](docs/architecture/05-security.md).

## Handling secrets

Never paste real keys, tokens or passwords into issues, commits, logs or screenshots. If a secret leaks, rotate it first and then clean the history.
