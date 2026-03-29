-- ─────────────────────────────────────────────────────────────
-- Marthashof Schema
-- Run once against your Neon database
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENTITIES ─────────────────────────────────────────────────
CREATE TABLE entities (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  short       TEXT NOT NULL
);

INSERT INTO entities VALUES
  ('schwedter-40',  'Schwedter Str. 40', 'S40'),
  ('schwedter-37',  'Schwedter Str. 37', 'S37'),
  ('marthashof-bg', 'Marthashof B–G',    'B–G'),
  ('marthashof-ho', 'Marthashof H–O',    'H–O'),
  ('marthashof-p',  'Marthashof P',      'P');

-- ── MODERATORS ───────────────────────────────────────────────
-- One per entity. Token is a secure random string sent as ?token=xxx
-- in their private moderation URL. No passwords, no accounts.
CREATE TABLE moderators (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   TEXT NOT NULL REFERENCES entities(id),
  name        TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── EMAIL WHITELIST ──────────────────────────────────────────
-- Emails from these addresses auto-publish after AI processing.
-- Everything else goes to moderation queue.
CREATE TABLE email_whitelist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  entity_id   TEXT REFERENCES entities(id), -- NULL = applies to all entities
  label       TEXT,                          -- e.g. "Adrian Czerwonka"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO email_whitelist (email, entity_id, label) VALUES
  ('czerwonka@meterhoch2.de', NULL, 'Adrian Czerwonka'),
  ('zwing@meterhoch2.de',     NULL, 'Volker Zwing');

-- ── POSTS ────────────────────────────────────────────────────
CREATE TYPE post_status   AS ENUM ('pending', 'published', 'rejected');
CREATE TYPE post_source   AS ENUM ('email', 'manual');
CREATE TYPE post_category AS ENUM (
  'repairs', 'heating', 'water', 'post',
  'admin', 'noise', 'entry', 'general'
);
CREATE TYPE post_scope AS ENUM ('entity', 'all');

CREATE TABLE posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at        TIMESTAMPTZ,

  status              post_status NOT NULL DEFAULT 'pending',
  source              post_source NOT NULL,
  scope               post_scope  NOT NULL DEFAULT 'entity',

  entity_id           TEXT REFERENCES entities(id), -- NULL = development-wide
  category            post_category NOT NULL DEFAULT 'general',

  -- Content
  subject             TEXT NOT NULL,
  anonymised_content  TEXT NOT NULL,          -- shown publicly
  original_content    TEXT,                   -- never exposed via API, admin only

  -- Email metadata (if source = email)
  sender_email        TEXT,
  sender_name         TEXT,

  -- Moderation
  moderated_by        UUID REFERENCES moderators(id),
  moderated_at        TIMESTAMPTZ,
  rejection_reason    TEXT,

  -- Escalation
  escalated_at        TIMESTAMPTZ,
  escalation_level    INTEGER DEFAULT 0       -- 1 = Adrian, 2 = Volker CC'd
);

CREATE INDEX idx_posts_status    ON posts(status);
CREATE INDEX idx_posts_entity    ON posts(entity_id);
CREATE INDEX idx_posts_category  ON posts(category);
CREATE INDEX idx_posts_created   ON posts(created_at DESC);

-- ── VOTES ────────────────────────────────────────────────────
-- Fingerprint = hashed (IP + user agent) — no personal data stored
CREATE TABLE votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, fingerprint)
);

CREATE INDEX idx_votes_post ON votes(post_id);

-- ── ESCALATIONS ──────────────────────────────────────────────
CREATE TABLE escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES posts(id),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  vote_count      INTEGER NOT NULL,
  escalation_level INTEGER NOT NULL,          -- 1 = Adrian only, 2 = Volker CC'd
  recipient_email TEXT NOT NULL,
  cc_email        TEXT
);

-- ── VOTE COUNT VIEW ──────────────────────────────────────────
-- Convenient for public board queries
CREATE VIEW posts_with_votes AS
  SELECT
    p.*,
    COUNT(v.id)::INT AS vote_count
  FROM posts p
  LEFT JOIN votes v ON v.post_id = p.id
  WHERE p.status = 'published'
  GROUP BY p.id
  ORDER BY p.published_at DESC;
