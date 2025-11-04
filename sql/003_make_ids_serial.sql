-- Make id columns auto-increment using sequences (idempotent)
-- This will create sequences for clients, projects and payments and set their DEFAULTs

-- CLIENTS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'clients_id_seq') THEN
    CREATE SEQUENCE clients_id_seq;
  END IF;
END$$;

SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id) FROM clients), 0) + 1, false);
ALTER SEQUENCE clients_id_seq OWNED BY clients.id;
ALTER TABLE clients ALTER COLUMN id SET DEFAULT nextval('clients_id_seq');

-- PROJECTS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'projects_id_seq') THEN
    CREATE SEQUENCE projects_id_seq;
  END IF;
END$$;

SELECT setval('projects_id_seq', COALESCE((SELECT MAX(id) FROM projects), 0) + 1, false);
ALTER SEQUENCE projects_id_seq OWNED BY projects.id;
ALTER TABLE projects ALTER COLUMN id SET DEFAULT nextval('projects_id_seq');

-- PAYMENTS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'payments_id_seq') THEN
    CREATE SEQUENCE payments_id_seq;
  END IF;
END$$;

SELECT setval('payments_id_seq', COALESCE((SELECT MAX(id) FROM payments), 0) + 1, false);
ALTER SEQUENCE payments_id_seq OWNED BY payments.id;
ALTER TABLE payments ALTER COLUMN id SET DEFAULT nextval('payments_id_seq');

-- Verify: after running this, inserts that omit id will get next value from sequence.
