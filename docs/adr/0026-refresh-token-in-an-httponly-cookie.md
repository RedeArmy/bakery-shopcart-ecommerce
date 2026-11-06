# ADR-0026: Refresh token in an HttpOnly cookie

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The design (section 14) and the [frontend design](../architecture/06-frontend-lld.md) say that the access token lives in memory and the refresh token in a `HttpOnly; SameSite=Strict` cookie. The backend built for Delivery Phase 1 does something else: `POST /auth/login` and `POST /auth/refresh` return the refresh token in the JSON body and `refresh` and `logout` read it from the body. The Postman collection proves the rotation and the reuse detection through that body.

The frontend has to keep the refresh token somewhere. In `localStorage` or `sessionStorage` any script injected into the page can read a seven-day credential and use it elsewhere. A cookie that scripts cannot read removes that exposure, and it keeps the session across a page reload, which memory alone cannot. The shop and the API share one origin behind nginx, so `SameSite=Strict` needs no CORS exception.

## Decision

We will deliver the refresh token in a cookie and keep the body path for clients that are not browsers.

- `login` and `refresh` set the cookie `refreshToken`: `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Max-Age` equal to `REFRESH_TOKEN_DAYS`, and `Secure` when `APP_PUBLIC_URL` is `https`.
- `refresh` and `logout` read the cookie first and fall back to the `refreshToken` field of the body. Postman, `newman` and any other API client keep working unchanged.
- `logout` clears the cookie.
- The response bodies and the OpenAPI schemas keep the field, so the contract does not break. The frontend never stores it.
- The frontend keeps the access token in memory, restores the session by calling `refresh` when the page loads, and renews on a `401` with a single-flight interceptor.
- Rotation and reuse detection do not change: a reused token still closes the whole family.

## Consequences

- A script injected into the page cannot read the refresh token, and a reload does not sign the customer out.
- `SameSite=Strict` and the origin allowlist of CORS cover the cross-site request risk of an endpoint that only issues tokens. No separate CSRF token is added.
- The backend needs a change before the authentication screens: the cookie in the two routes, tests for the cookie and for the fallback, and the OpenAPI document updated with the cookie. This closes debt D-24 of the [technical audit](../quality/technical-audit-stage-2.md).
- nginx must pass `Set-Cookie` and the `Cookie` header, which it does by default.
- Local development over plain `http` has no `Secure` flag; production must terminate TLS in front of nginx.

## Alternatives considered

- **Memory only.** The safest in the browser, but every reload signs the customer out, which breaks the purchase flow.
- **`localStorage` or `sessionStorage`.** No backend work, but readable by any injected script; rejected for a credential that lives seven days.
- **A backend for the frontend that holds the tokens.** More moving parts than the delivery needs.

## Links

- Design section 14, [frontend design](../architecture/06-frontend-lld.md), [security](../architecture/05-security.md), [ADR-0010](0010-layered-rate-limiting.md).
