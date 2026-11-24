# Claude repository instructions

Read and follow [`AGENTS.md`](AGENTS.md) before making changes. It is the canonical repository policy for product identity, architecture, skill routing, security, testing, documentation, and Git discipline.

## Required local skills

- For implementation or behavior changes, load `.agents/skills/social-app-feature-delivery/SKILL.md`.
- For reviews and release/security readiness, load `.agents/skills/social-app-review/SKILL.md`.
- For security-sensitive implementation or review, also load `.agents/skills/social-app-security/SKILL.md`.

Do not use external skills marked blocked or incomplete in `docs/skills/security-reports/README.md`. Do not treat a catalog badge as project approval.

## Claude-specific behavior

- Read only task-relevant documentation; do not load the entire documentation tree by default.
- Preserve the modular-monolith dependency direction and the PostgreSQL/Drizzle decision.
- Keep changes and commits small and specific.
- Report verification evidence and unresolved risks truthfully.
