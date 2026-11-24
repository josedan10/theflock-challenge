---
name: social-app-security
description: Apply the repository's OWASP-aligned security workflow to backend, frontend, authentication, data, uploads, dependencies, and release changes. Use whenever code crosses a trust boundary or a security review is requested.
---

# Social App Security

Follow `AGENTS.md`. Use OWASP ASVS 5.0.0 Level 1 as the minimum baseline and selected Level 2 requirements for authentication, sessions, authorization, personal data, uploads, and production operations. Cite versioned requirement IDs when a specific ASVS control is applied or tested.

This workflow does not grant permission to rotate secrets, probe production, run destructive scanners, or deploy changes.

## Identify the trust boundary

1. Identify untrusted inputs, protected assets, actors, authorization boundaries, persistence, outbound calls, and browser origins.
2. Add abuse cases beside affected acceptance criteria: impersonation, object-level authorization bypass, replay, race conditions, enumeration, injection, resource exhaustion, and sensitive-data disclosure.
3. Select the applicable backend, frontend, data, dependency, and operational controls below. Record intentionally deferred controls and their risk.

## Backend controls

- Validate request shape, size, encoding, and domain rules at the HTTP boundary; repeat critical invariants with database constraints.
- Authenticate every protected operation and authorize the specific object/action. Test cross-user access explicitly.
- Use opaque, revocable server-side sessions; Argon2id password hashing; generic credential failures; rotation on login; bounded expiry.
- Require CSRF protection for cookie-authenticated mutations and exact-origin CORS. Never combine credentialed requests with wildcard origins.
- Use parameterized Drizzle queries, allowlisted sorting/filtering, signed opaque cursors, bounded page sizes, and transaction-safe concurrency.
- Rate-limit authentication and write actions, cap bodies/uploads, set timeouts, and fail closed on exceptional conditions.
- Return stable safe errors. Log security-relevant events with request IDs but never passwords, cookies, tokens, raw secrets, or unnecessary personal data.
- For uploads, verify decoded content type, size, dimensions, ownership, storage key, and cleanup state; serve user content from a controlled origin.
- For outbound URLs, allowlist schemes/destinations and prevent access to private, loopback, link-local, metadata, and redirect-derived internal targets.

## Frontend controls

- Treat API, URL, storage, and user-generated data as untrusted. Rely on React escaping; do not render unsanitized HTML.
- Keep session tokens out of JavaScript-accessible storage. Do not place secrets or server credentials in `NEXT_PUBLIC_*` variables or client bundles.
- Propagate CSRF tokens through the approved client, use credentialed requests only to approved origins, and avoid open redirects.
- Apply Content Security Policy, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame restrictions deliberately at the correct deployment layer.
- Prevent sensitive authenticated responses from shared caching and avoid exposing private values in URLs, analytics, errors, source maps, or browser history.
- Restrict third-party scripts/resources; prefer self-hosting or integrity-pinned assets and document the data they receive.
- Ensure optimistic UI never substitutes for server authorization and always reconciles with the canonical response.

## Data, dependencies, and operations

- Collect the minimum personal data with an explicit purpose and retention/deletion policy.
- Apply least-privilege database and deployment credentials; separate development, preview, staging, and production secrets.
- Pin dependencies with the lockfile, review lifecycle scripts, generate an SBOM, and run dependency, secret, SAST, and container scans in CI.
- Keep health responses non-sensitive. Verify secure cookies, TLS, CORS, CSP, backups, restore evidence, audit-safe logs, and rollback before release.

## Verification evidence

For every applicable control, prefer an executable test or configuration assertion. At minimum include:

- Negative authentication and cross-user authorization tests.
- Validation boundaries and malformed/tampered input tests.
- CSRF, CORS, cookie-attribute, and security-header tests.
- Injection-safe query tests and concurrency/idempotency tests.
- Rate-limit and safe-error behavior.
- Dependency, secret, static-analysis, and container scan results for release candidates.

Report findings with severity, `file:line` evidence, impact, the smallest safe remediation, and the test that proves it. Distinguish verified defects from missing evidence. Block release on unresolved critical/high findings or missing mandatory authentication, authorization, secret, migration, backup, or rollback evidence.

## Normative references

- OWASP ASVS 5.0.0: `https://asvs.owasp.org/`
- OWASP Top 10:2025: `https://top10.owasp.org/`
- OWASP Cheat Sheet Series: `https://cheatsheetseries.owasp.org/`

