This folder contains SQL migrations for the BFF database.

Naming convention: use a timestamp prefix and descriptive name, e.g. `20251206_create_users.up.sql` and corresponding `.down.sql` for revert.

How to run (Postgres):

```bash
# Apply UP migration
psql -d <dbname> -f be/bff/migrations/20251206_create_users.up.sql

# Revert (apply DOWN)
psql -d <dbname> -f be/bff/migrations/20251206_create_users.down.sql
```

Notes:
- The UP migration creates the `users` table, a unique index on lower(email), and a trigger to update `updated_at`.
- The migration uses `pgcrypto` for `gen_random_uuid()`; ensure the database user has permission to create the extension or create it separately.
- If you prefer using a migration tool (Knex, Flyway, Liquibase), convert these SQL files into the tool's format and run via that tool.
