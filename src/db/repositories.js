// src/db/repositories.js
const pool = require('./pool');

/**
 * Ensures a repository row exists, returns its internal id.
 */
async function upsertRepository({ githubRepoId, fullName, installationId }) {
  // upsert: insert new row, but if github_repo_id already exists, update
  // full_name/installation_id instead (handles renames / re-installs)
  const { rows } = await pool.query(
    `INSERT INTO repositories (github_repo_id, full_name, installation_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (github_repo_id)
     DO UPDATE SET full_name = EXCLUDED.full_name, installation_id = EXCLUDED.installation_id
     RETURNING id`,
    [githubRepoId, fullName, installationId]
  );
  return rows[0].id; // internal db id, not the same as githubRepoId
}

/**
 * Gets or creates a pull_request row. Returns { id, last_reviewed_sha }.
 */
async function getOrCreatePullRequest({ repositoryId, prNumber }) {
  // unique on (repository_id, pr_number) — PR numbers reset per repo, so
  // both together identify a unique PR
  const { rows } = await pool.query(
    `INSERT INTO pull_requests (repository_id, pr_number)
     VALUES ($1, $2)
     ON CONFLICT (repository_id, pr_number) DO UPDATE SET updated_at = now()
     RETURNING id, last_reviewed_sha`,
    [repositoryId, prNumber]
  );
  // last_reviewed_sha is NULL for a brand new PR — this is what the
  // orchestrator checks to decide if an incremental diff is even possible
  return rows[0];
}

async function updateLastReviewedSha({ pullRequestId, sha }) {
  // called at the end of a review — advances the watermark so the next
  // synchronize event's incremental diff knows where to start from
  await pool.query(
    `UPDATE pull_requests SET last_reviewed_sha = $1, updated_at = now() WHERE id = $2`,
    [sha, pullRequestId]
  );
}

module.exports = { upsertRepository, getOrCreatePullRequest, updateLastReviewedSha };