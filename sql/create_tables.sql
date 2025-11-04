-- PostgreSQL SQL script to create tables for PRF project
-- Tables: admins, clients, projects, payments, tokens, logs
-- Includes constraints, useful indexes and a trigger to update project balance when payments are inserted

-- Use extension for UUIDs if desired (optional)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ADMINS: optional table for admin authentication
CREATE TABLE IF NOT EXISTS admins (
    email TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
    id integer PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- PROJECTS
CREATE TABLE IF NOT EXISTS projects (
    id integer PRIMARY KEY,
    client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status integer NOT NULL DEFAULT 1, -- 1 - 'Activo' | 0 - 'Cerrado'
    budget NUMERIC(14,2) NOT NULL CHECK (budget >= 0),
    balance NUMERIC(14,2) NOT NULL CHECK (balance >= 0),
    created_at TIMESTAMPTZ DEFAULT now()
    -- delete Boolean DEFAULT FALSE
);
