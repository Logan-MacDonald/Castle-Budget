#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE castle_budget_test;
  GRANT ALL PRIVILEGES ON DATABASE castle_budget_test TO ${POSTGRES_USER};
EOSQL
