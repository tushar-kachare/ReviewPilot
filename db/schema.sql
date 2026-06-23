-- ReviewPilot database schema
-- Requires the pgvector extension.

CREATE EXTENSION IF NOT EXISTS vector;

-- One row per repository ReviewPilot has been installed on
CREATE TABLE IF NOT EXISTS repositories (
    id              BIGSERIAL PRIMARY KEY,
    github_repo_id  BIGINT UNIQUE NOT NULL,
    full_name       TEXT NOT NULL,         -- e.g. "tushar-kachare/ReviewPilot"
    installation_id BIGINT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per PR ReviewPilot has reviewed (tracks last reviewed commit
-- so we know what's "new" for incremental diff analysis)
CREATE TABLE IF NOT EXISTS pull_requests (
    id                  BIGSERIAL PRIMARY KEY,
    repository_id       BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    pr_number           INT NOT NULL,
    last_reviewed_sha   TEXT,               -- head sha at last review
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (repository_id, pr_number)
);

-- One row per individual review comment ReviewPilot has posted.
-- The embedding lets us semantically match new findings against old ones
-- to avoid posting duplicate feedback.
CREATE TABLE IF NOT EXISTS review_comments (
    id              BIGSERIAL PRIMARY KEY,
    repository_id   BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    pull_request_id BIGINT REFERENCES pull_requests(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    line_number     INT,
    severity        TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'nit', 'praise')),
    body            TEXT NOT NULL,
    embedding       vector(768),
    github_comment_id BIGINT,             -- id returned by GitHub after posting, for de-dup/edits
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speeds up semantic similarity search (cosine distance) scoped per repo
CREATE INDEX IF NOT EXISTS review_comments_embedding_idx
    ON review_comments
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS review_comments_repo_idx
    ON review_comments (repository_id);

CREATE INDEX IF NOT EXISTS review_comments_file_idx
    ON review_comments (repository_id, file_path);
