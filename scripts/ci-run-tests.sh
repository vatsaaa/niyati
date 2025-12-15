#!/usr/bin/env bash
set -e

echo "Starting CI test script from $(pwd)"

# install platform deps so migration runner can use pg
echo "Installing be/bff-platform deps..."
cd be/bff-platform
npm ci

# go back to repo root
cd ../..

# start postgres on alternate host port 55432
echo "Starting Postgres container on port 55432..."
docker rm -f niyati-ci-postgres >/dev/null 2>&1 || true
docker run --name niyati-ci-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=niyati_test -p 55432:5432 -d postgres:15

# run migrations by requiring the runner from bff-platform so it can resolve pg
echo "Running migrations via psql inside container..."
# wait for postgres inside container
for i in $(seq 1 60); do
	docker exec niyati-ci-postgres pg_isready -U postgres -d niyati_test >/dev/null 2>&1 && break || sleep 1
done
# apply each .up.sql migration in lexical order
for f in $(ls -1 be/migrations/*.up.sql | sort); do
	echo "Applying $f"
	docker exec -i niyati-ci-postgres psql -U postgres -d niyati_test -f - < "$f"
done
cd be/bff-platform

# run platform tests
echo "Running bff-platform tests..."
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/niyati_test" NODE_ENV=test npm test || { echo "bff-platform tests failed"; exit 2; }

# run auth tests
echo "Installing be/bff-auth deps..."
cd ../bff-auth
npm ci

echo "Running bff-auth tests..."
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/niyati_test" NODE_ENV=test npm test || { echo "bff-auth tests failed"; exit 3; }

# cleanup
cd ../../
docker rm -f niyati-ci-postgres >/dev/null 2>&1 || true

echo "ALL_DONE"
