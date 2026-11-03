\set ON_ERROR_STOP on
-- Manual, authorized metadata/data-consistency review only; emits counts, no identities.
begin isolation level repeatable read read only;
set local row_security=off;
\ir 010_checks.sql
rollback;
