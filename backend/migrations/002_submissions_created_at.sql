-- Ensure submissions exists for fresh databases (idempotent; no-op if already present).
-- Then add/normalize created_at for legacy production schemas.

CREATE TABLE IF NOT EXISTS submissions (
    id          BIGSERIAL PRIMARY KEY,
    role        TEXT,
    name        TEXT,
    title       TEXT,
    company     TEXT,
    contact     TEXT,
    social      TEXT,
    intro       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Task-04 requires stable newest-first pagination for existing submissions.
ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Normalize legacy schemas that used a timezone-less timestamp.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'submissions'
          AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE submissions
            ALTER COLUMN created_at TYPE TIMESTAMPTZ
            USING created_at AT TIME ZONE 'UTC';
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_submissions_created_at_id
    ON submissions (created_at DESC, id DESC);
