-- Runs once, on first initialisation of the postgres volume.
-- Integration and E2E tests use this database so they never touch development data.
CREATE DATABASE peos_test;
