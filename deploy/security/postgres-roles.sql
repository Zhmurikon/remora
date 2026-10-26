\set ON_ERROR_STOP on
\if :{?runtime_password}
\else
  \error 'Передайте -v runtime_password=...'
\endif
\if :{?migrator_password}
\else
  \error 'Передайте -v migrator_password=...'
\endif
\if :{?readonly_password}
\else
  \error 'Передайте -v readonly_password=...'
\endif

CREATE ROLE remora_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE remora_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE remora_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE remora_runtime PASSWORD :'runtime_password';
ALTER ROLE remora_migrator PASSWORD :'migrator_password';
ALTER ROLE remora_readonly PASSWORD :'readonly_password';

GRANT CONNECT ON DATABASE remora TO remora_runtime, remora_migrator, remora_readonly;
GRANT USAGE ON SCHEMA public TO remora_runtime, remora_readonly;
GRANT USAGE, CREATE ON SCHEMA public TO remora_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO remora_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO remora_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO remora_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE remora_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO remora_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE remora_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO remora_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE remora_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO remora_readonly;
