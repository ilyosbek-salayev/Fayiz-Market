-- Phone + one-time-code sign-in and a separate courier delivery fee (Fayz Market V1 UX refinement).
--
-- otp_codes keeps only short-lived one-time codes. SQLite cannot widen a CHECK constraint, so the table is rebuilt
-- with the extra 'login' purpose and EVERY row is copied first (ids included) — nothing is lost, and codes that are
-- still valid keep working. Orders get delivery_fee (default 0: existing orders had no separate fee).
-- The previous Worker keeps working on this schema (it never uses 'login' and never writes delivery_fee).
CREATE TABLE otp_codes_v8 (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('register','reset','link','login')),
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO otp_codes_v8(id,phone,purpose,code_hash,attempts,expires_at,consumed_at,created_at)
  SELECT id,phone,purpose,code_hash,attempts,expires_at,consumed_at,created_at FROM otp_codes;
DROP TABLE otp_codes;
ALTER TABLE otp_codes_v8 RENAME TO otp_codes;
CREATE INDEX idx_otp_phone ON otp_codes(phone, purpose, id);

ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0 CHECK(delivery_fee >= 0);
INSERT OR IGNORE INTO settings(key,value) VALUES ('delivery_fee','0'), ('delivery_free_from','0');
