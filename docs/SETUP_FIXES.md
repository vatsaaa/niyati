# Setup Fixes Applied - 7 December 2025

## Issues Encountered and Resolved

### 1. Duplicate Import in Astrology Routes ✅

**Problem**: BFF container was stuck in restart loop due to syntax error.

**Error**:
```
SyntaxError: Identifier 'express' has already been declared
    at /app/src/routes/astrology.js:4
```

**Root Cause**: The first 3 lines of `be/bff/src/routes/astrology.js` were duplicated:
```javascript
const express = require('express');
const router = express.Router();
const astrologyService = require('../services/astrologyService');
const express = require('express');  // DUPLICATE
const router = express.Router();     // DUPLICATE
const astrologyService = require('../services/astrologyService'); // DUPLICATE
```

**Fix**: Removed duplicate lines.

---

### 2. Missing Dependencies in Docker Container ✅

**Problem**: After fixing syntax error, BFF still failed to start.

**Error**:
```
Error: Cannot find module 'jsonwebtoken'
```

**Root Cause**: Docker container's `node_modules` were out of sync with `package.json`. The volume mount excluded `node_modules`, but the container wasn't rebuilt after dependency changes.

**Fix**: Rebuilt Docker image to install all dependencies:
```bash
docker-compose down bff-service
docker-compose up -d --build bff-service
```

---

### 3. Migration Files Running in Wrong Order ✅

**Problem**: Migrations failed because `users` table didn't exist.

**Error**:
```
Migration failed: relation "users" does not exist
```

**Root Cause**: 
1. Migration runner was processing **all** `.sql` files, including `.down.sql` files
2. Lexical sorting caused `.down.sql` files to run before `.up.sql` files
3. Migration files had the same timestamp prefix, so dependent tables (like `oauth_accounts`) were running before the base `users` table

**Fixes Applied**:

#### Fix 3a: Filter Only `.up.sql` Files
Updated `be/bff/scripts/run_migrations.js`:
```javascript
// Before
.filter((f) => f.endsWith('.sql'))

// After
.filter((f) => f.endsWith('.up.sql'))
```

#### Fix 3b: Renamed Migration Files for Proper Ordering
```bash
# Renamed to ensure users table is created first
20251206_create_users.* → 20251206_01_create_users.*
20251206_create_refresh_tokens.* → 20251206_02_create_refresh_tokens.*
20251206_create_oauth_accounts.* → 20251206_03_create_oauth_accounts.*
20251206_create_password_resets.* → 20251206_04_create_password_resets.*
```

**Execution Order** (correct):
1. `20251206_01_create_users.up.sql` - Base users table
2. `20251206_02_create_refresh_tokens.up.sql` - References users
3. `20251206_03_create_oauth_accounts.up.sql` - References users
4. `20251206_04_create_password_resets.up.sql` - References users

---

## Verification Results ✅

### Database Health
```bash
$ ./scripts/db.sh health
✓ Database is healthy
PostgreSQL 15.15 on aarch64-unknown-linux-musl
niyati_dev | niyati | 7893 kB
User tables: 5
```

### Migrations Applied
```bash
$ ./scripts/db.sh migrate
applying: 20251206_01_create_users.up.sql
applied: 20251206_01_create_users.up.sql
applying: 20251206_02_create_refresh_tokens.up.sql
applied: 20251206_02_create_refresh_tokens.up.sql
applying: 20251206_03_create_oauth_accounts.up.sql
applied: 20251206_03_create_oauth_accounts.up.sql
applying: 20251206_04_create_password_resets.up.sql
applied: 20251206_04_create_password_resets.up.sql
Migrations complete
```

### Test Data Seeded
```bash
$ ./scripts/db.sh seed
Inserted test user: 6ba6fd71-a095-4256-87e7-aaec9098db32
Seeding complete
```

### Database Tables Created
```sql
postgres=# \dt
             List of relations
 Schema |      Name       | Type  | Owner  
--------+-----------------+-------+--------
 public | migrations      | table | niyati
 public | oauth_accounts  | table | niyati
 public | password_resets | table | niyati
 public | refresh_tokens  | table | niyati
 public | users           | table | niyati
(5 rows)
```

### BFF Service Running
```bash
$ curl http://localhost:3000/api/v1/telemetry/health
{
  "status": "ok",
  "timestamp": "2025-12-07T08:13:40.416Z",
  "uptime": 218.901490267
}
```

### Container Status
```bash
$ docker ps | grep niyati
niyati-bff-dev       Up (healthy)   0.0.0.0:3000->3000/tcp
niyati-ui-dev        Up             0.0.0.0:5173->5173/tcp
niyati-postgres-dev  Up (healthy)   0.0.0.0:5432->5432/tcp
```

---

## Best Practices Established

### Migration Naming Convention
Use sequential numbering for migrations with dependencies:
```
YYYYMMDD_NN_description.up.sql
YYYYMMDD_NN_description.down.sql
```

Where:
- `YYYYMMDD` - Date of migration
- `NN` - Two-digit sequence number (01, 02, 03...)
- `description` - Brief description of change
- `.up.sql` - Forward migration (applied)
- `.down.sql` - Rollback migration (for reference/rollback)

### Migration Runner
- Only runs `.up.sql` files automatically
- Runs migrations in lexical (alphabetical) order
- Tracks applied migrations in `migrations` table
- Skips already-applied migrations
- Uses transactions for atomicity

### Docker Container Rebuilds
When to rebuild containers:
- After changing `package.json` dependencies
- After modifying Dockerfile
- When `node_modules` are out of sync

Rebuild command:
```bash
docker-compose up -d --build <service-name>
```

---

## Files Modified

1. **be/bff/src/routes/astrology.js** - Removed duplicate imports
2. **be/bff/scripts/run_migrations.js** - Filter only `.up.sql` files
3. **be/bff/migrations/** - Renamed all migration files with sequence numbers

## Files Rebuilt

1. **niyati-bff-service** Docker image - Fresh install of dependencies

---

## Current System State

✅ PostgreSQL running independently as separate service  
✅ BFF connected to PostgreSQL with connection pooling  
✅ All database tables created and migrated  
✅ Test user seeded in database  
✅ BFF health endpoint responding  
✅ All containers healthy  

The containerized setup with PostgreSQL separation is **fully operational**.
