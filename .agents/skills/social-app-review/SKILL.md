---
name: social-app-review
description: Review this repository's code, pull requests, architecture, migrations, or release readiness against product acceptance criteria, modular boundaries, security, testing, accessibility, operability, documentation, and commit scope. Use for review and audit requests, not ordinary implementation.
---

# Social App Review

Follow `AGENTS.md`. Review evidence before proposing changes. Do not silently implement fixes unless the user asks for remediation.

## Determine the review surface

1. Identify the requested diff, branch, files, feature, migration, or release candidate.
2. Read the matching requirement and acceptance criteria plus only the relevant technical documents.
3. Inspect changed code, tests, migrations, generated contracts, configuration, documentation, and commit boundaries.
4. Load only approved specialist skills relevant to the observed change. Never use a blocked/incomplete skill to justify a finding.

## Review priorities

Report concrete findings in this order:

1. **Correctness:** acceptance criteria, boundary behavior, ordering, pagination, idempotency, concurrency, and error semantics.
2. **Security/privacy:** authentication, ownership authorization, CSRF/CORS/cookies, injection, rate limits, secret/PII exposure, and dependency or skill provenance.
3. **Data/migrations:** constraints, transactions, delete behavior, indexes, query bounds/plans, forward compatibility, lock risk, backup/restore impact.
4. **Architecture/legibility:** dependency direction, cohesion, duplication, unnecessary patterns, hidden state, naming, typed errors, and useful JSDoc.
5. **Testing:** meaningful positive/negative coverage, real PostgreSQL integration, flake risk, acceptance-ID traceability, and untested operational paths.
6. **UI quality:** semantics, keyboard/focus, responsive breakpoints, async/error states, optimistic rollback, and screen-reader behavior.
7. **Operations:** configuration validation, health/readiness, logging, metrics, graceful shutdown, rollout/rollback, and runbook accuracy.
8. **Change hygiene:** unrelated edits, generated artifacts, secret files, oversized/mixed commits, and documentation drift.

## Finding format

Lead with findings, ordered by severity. Each finding must include:

- Severity: critical, high, medium, or low.
- Exact file and line or other stable evidence.
- The violated behavior/invariant and credible impact.
- The smallest safe remediation and the test that would prove it.

Distinguish verified defects from risks or questions. Do not invent findings to populate every category. If no findings remain, say so and list residual testing or evidence gaps.

For release review, additionally state a clear `GO`, `GO WITH CONDITIONS`, or `NO-GO` recommendation with blocking conditions. Never approve production when required checks, migrations, backups, restore evidence, or rollback plans are merely assumed.

