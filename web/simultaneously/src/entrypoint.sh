#!/bin/sh
set -eu

service mysql start
service postgresql start

mysql --protocol=socket -uroot <<'SQL'
DROP DATABASE IF EXISTS simultaneously;
CREATE DATABASE simultaneously CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

DROP USER IF EXISTS 'simultaneously'@'127.0.0.1';
CREATE USER 'simultaneously'@'127.0.0.1' IDENTIFIED BY 'simultaneously';

USE simultaneously;
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE
);
INSERT INTO users (id, name) VALUES
    (1, 'scoobydoo'),
    (2, 'toto'),
    (3, 'lassie'),
    (4, 'snoopy'),
    (5, 'pluto'),
    (6, 'odie'),
    (7, 'bolt'),
    (8, 'beethoven'),
    (9, 'hachiko'),
    (10, 'laika');

GRANT SELECT ON simultaneously.users TO 'simultaneously'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

runuser -u postgres -- psql --set ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'simultaneously' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS simultaneously;
DROP ROLE IF EXISTS simultaneously;
CREATE ROLE simultaneously LOGIN PASSWORD 'simultaneously';
ALTER ROLE simultaneously SET default_transaction_read_only = on;
ALTER ROLE simultaneously SET statement_timeout = '2s';
CREATE DATABASE simultaneously OWNER postgres;
SQL

runuser -u postgres -- psql --set ON_ERROR_STOP=1 --dbname simultaneously <<'SQL'
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE
);
INSERT INTO users (id, name) VALUES
    (1, 'scoobydoo'),
    (2, 'toto'),
    (3, 'lassie'),
    (4, 'snoopy'),
    (5, 'pluto'),
    (6, 'odie'),
    (7, 'bolt'),
    (8, 'beethoven'),
    (9, 'hachiko'),
    (10, 'laika');

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE SELECT ON pg_catalog.pg_stat_activity FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_activity(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.pg_stat_get_backend_activity(integer) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO simultaneously;
GRANT SELECT ON users TO simultaneously;
SQL

install -d -m 0755 /var/lib/simultaneously
rm -f /var/lib/simultaneously/users.sqlite
sqlite3 /var/lib/simultaneously/users.sqlite <<'SQL'
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
INSERT INTO users (id, name) VALUES
    (1, 'scoobydoo'),
    (2, 'toto'),
    (3, 'lassie'),
    (4, 'snoopy'),
    (5, 'pluto'),
    (6, 'odie'),
    (7, 'bolt'),
    (8, 'beethoven'),
    (9, 'hachiko'),
    (10, 'laika');
SQL
chmod 0444 /var/lib/simultaneously/users.sqlite

exec "$@"
