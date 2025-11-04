-- Migration: create access_tokens and logs tables
-- Solo para evitar error si las policies existen: ejecuta una vez
DROP POLICY IF EXISTS own_clients ON clients;
DROP POLICY IF EXISTS own_projects ON projects;
DROP POLICY IF EXISTS own_payments ON payments;
CREATE TABLE IF NOT EXISTS access_tokens (
  token TEXT PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_tokens_client_idx ON access_tokens(client_id);
CREATE INDEX IF NOT EXISTS access_tokens_expires_idx ON access_tokens(expires_at);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logs_action_idx ON logs(action);
CREATE INDEX IF NOT EXISTS logs_created_at_idx ON logs(created_at);
