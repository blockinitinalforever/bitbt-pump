-- BitBT Admin Phase 1: admins, sessions, team_members
-- Non-destructive: CREATE IF NOT EXISTS / seed only when empty

CREATE TABLE IF NOT EXISTS admins (
    id              BIGSERIAL PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admins_username ON admins (username);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        BIGINT NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions (admin_id);

CREATE TABLE IF NOT EXISTS team_members (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    role_en         TEXT NOT NULL,
    role_zh         TEXT NOT NULL,
    tags_en         TEXT[] NOT NULL DEFAULT '{}',
    tags_zh         TEXT[] NOT NULL DEFAULT '{}',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT team_members_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_team_members_sort_order ON team_members (sort_order);
CREATE INDEX IF NOT EXISTS idx_team_members_active_sort
    ON team_members (is_active, sort_order)
    WHERE is_active = TRUE;

-- Seed current 8 leadership members (bilingual) when table is empty.
-- No image / avatar / logo columns by design (Phase 1).
INSERT INTO team_members (name, role_en, role_zh, tags_en, tags_zh, sort_order, is_active)
SELECT * FROM (VALUES
    (
        'Rick',
        'Founder & Managing Partner',
        '创始人 & 管理合伙人',
        ARRAY['Investment', 'Incubation', 'Capital Ops', 'Listing Strategy', 'Global Ecosystem']::TEXT[],
        ARRAY['项目投资', '孵化', '资本运作', '上市战略', '全球生态合作']::TEXT[],
        1,
        TRUE
    ),
    (
        'Michael',
        'Investment Committee',
        '投资委员会',
        ARRAY['Investment Decisions', 'Deal Screening', 'Risk Control', 'Post-Investment']::TEXT[],
        ARRAY['投资决策', '项目筛选', '风险控制', '投后管理']::TEXT[],
        2,
        TRUE
    ),
    (
        'Dylan',
        'Technology & Growth Center',
        '技术研发 & 增长中心',
        ARRAY['Blockchain & AI R&D', 'Brand Strategy', 'Global Expansion', 'Community Growth']::TEXT[],
        ARRAY['区块链&AI研发', '品牌战略', '全球市场拓展', '社区增长']::TEXT[],
        3,
        TRUE
    ),
    (
        'Rex',
        'Co-founder',
        '联合创始人',
        ARRAY['Capital Management', 'Liquidity Management']::TEXT[],
        ARRAY['资金管理', '流动性管理']::TEXT[],
        4,
        TRUE
    ),
    (
        'Elora',
        'Co-founder',
        '联合创始人',
        ARRAY['Marketing']::TEXT[],
        ARRAY['市场营销']::TEXT[],
        5,
        TRUE
    ),
    (
        'Hector',
        'COO',
        'COO',
        ARRAY['Market Operations']::TEXT[],
        ARRAY['市场运营']::TEXT[],
        6,
        TRUE
    ),
    (
        'Peter Yan',
        'CMO',
        'CMO',
        ARRAY['Brand Strategy', 'Marketing']::TEXT[],
        ARRAY['品牌战略', '市场营销']::TEXT[],
        7,
        TRUE
    ),
    (
        'Bryan',
        'CCO',
        'CCO',
        ARRAY['Business Development', 'Strategic Partnerships']::TEXT[],
        ARRAY['商务拓展', '战略合作']::TEXT[],
        8,
        TRUE
    )
) AS seed(name, role_en, role_zh, tags_en, tags_zh, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM team_members LIMIT 1);
