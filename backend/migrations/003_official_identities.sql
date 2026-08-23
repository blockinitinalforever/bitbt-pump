-- Admin-managed identities used by the public official verification tool.

CREATE TABLE IF NOT EXISTS official_identities (
    id                  BIGSERIAL PRIMARY KEY,
    channel_type        TEXT NOT NULL,
    value               TEXT NOT NULL,
    normalized_value    TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT official_identities_channel_type_check CHECK (
        channel_type IN ('website', 'telegram', 'email', 'phone', 'linkedin', 'x')
    ),
    CONSTRAINT official_identities_value_not_empty CHECK (length(btrim(value)) > 0),
    CONSTRAINT official_identities_value_max_len CHECK (char_length(value) <= 320),
    CONSTRAINT official_identities_normalized_not_empty CHECK (
        length(btrim(normalized_value)) > 0
    ),
    CONSTRAINT official_identities_normalized_max_len CHECK (
        char_length(normalized_value) <= 320
    ),
    CONSTRAINT official_identities_no_control_chars CHECK (
        value !~ '[[:cntrl:]]' AND normalized_value !~ '[[:cntrl:]]'
    ),
    CONSTRAINT official_identities_channel_normalized_unique UNIQUE (
        channel_type,
        normalized_value
    )
);

CREATE INDEX IF NOT EXISTS idx_official_identities_active_channel
    ON official_identities (channel_type, normalized_value)
    WHERE is_active = TRUE;

-- Preserve the identities previously built into the Next.js route.
INSERT INTO official_identities
    (channel_type, value, normalized_value, is_active)
VALUES
    ('website', 'bitbt.com', 'bitbt.com', TRUE),
    ('telegram', '@BitBTVentures', 'bitbtventures', TRUE),
    ('email', 'support@bitbt.com', 'support@bitbt.com', TRUE),
    ('x', '@0xcryptolin', '0xcryptolin', TRUE)
ON CONFLICT (channel_type, normalized_value) DO NOTHING;
