-- V1.1 email sign-in. Additive only: two nullable columns, one partial unique index and one new table.
-- Existing customers, sessions, orders and payments are untouched.
ALTER TABLE customers ADD COLUMN email TEXT;
ALTER TABLE customers ADD COLUMN email_verified_at TEXT;
CREATE UNIQUE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;

CREATE TABLE email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('register','login','reset','link')),
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_email_codes ON email_codes(email, purpose, id);
