// src/db/repositories.js
const pool = require('./pool');

/**
 * Ensures a repository row exists, returns its internal id.
 */
async function upsertRepository({ githubRepoId, fullName, installationId }) {
  const { rows } = await pool.query(
    `INSERT INTO repositories (github_repo_id, full_name, installation_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (github_repo_id)
     DO UPDATE SET full_name = EXCLUDED.full_name, installation_id = EXCLUDED.installation_id
     RETURNING id`,
    [githubRepoId, fullName, installationId]
  );
  return rows[0].id;
}

/**
 * Gets or creates a pull_request row. Returns { id, last_reviewed_sha }.
 */
async function getOrCreatePullRequest({ repositoryId, prNumber }) {
  const { rows } = await pool.query(
    `INSERT INTO pull_requests (repository_id, pr_number)
     VALUES ($1, $2)
     ON CONFLICT (repository_id, pr_number) DO UPDATE SET updated_at = now()
     RETURNING id, last_reviewed_sha`,
    [repositoryId, prNumber]
  );
  return rows[0];
}

async function updateLastReviewedSha({ pullRequestId, sha }) {
  await pool.query(
    `UPDATE pull_requests SET last_reviewed_sha = $1, updated_at = now() WHERE id = $2`,
    [sha, pullRequestId]
  );
}

module.exports = { upsertRepository, getOrCreatePullRequest, updateLastReviewedSha };
