# Local operations guide

This guide covers the supported local development stack only. There is no production deployment or external on-call procedure for this project.

## Start, inspect, stop

- Start and health-check: `pnpm stack:up`.
- Inspect services: `pnpm compose:ps`; inspect logs: `pnpm compose:logs`.
- Stop while preserving local database data: `pnpm compose:down`.
- Reset local data only with explicit intent: `docker compose down -v` (destructive).
- Run migrations: `pnpm db:migrate`.

Use `docs/SETUP.md` for prerequisites, environment setup, and verification commands. Do not paste `.env`, cookies, tokens, or database credentials into issue reports.

## Local database recovery

Before deliberately deleting a developer database, export any data that must be retained using the documented PostgreSQL tooling and verify the export can be read. This is a convenience for local development, not a production backup/retention system.

## Troubleshooting

1. Run `./scripts/doctor.sh` and inspect `docker compose ps`.
2. Check API and PostgreSQL logs by request ID; redact credentials and personal data before sharing.
3. Verify the configured local ports are available and `DATABASE_URL` points to the Compose PostgreSQL service.
4. Restart the affected local service after correcting configuration; avoid deleting the database volume unless reset is intended.
