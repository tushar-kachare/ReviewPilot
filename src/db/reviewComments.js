// src/db/reviewComments.js
const pool = require('./pool');

/**
 * Finds past review comments in this repo that are semantically similar
 * to a candidate finding, optionally scoped to the same file.
 *
 * Uses cosine distance (<=> operator from pgvector). Smaller distance = more similar.
 * A distance threshold around 0.15-0.25 is a reasonable starting point for
 * "this is basically the same feedback as before" with typical embedding models;
 * tune based on observed false positive/negative rates.
 */
async function findSimilarComments({ repositoryId, filePath, embedding, threshold = 0.2, limit = 3 }) {
  const { rows } = await pool.query(
    `SELECT id, body, severity, file_path, line_number,
            embedding <=> $1 AS distance
     FROM review_comments
     WHERE repository_id = $2
       AND file_path = $3
       AND embedding <=> $1 < $4
     ORDER BY distance ASC
     LIMIT $5`,
    [JSON.stringify(embedding), repositoryId, filePath, threshold, limit]
  );
  return rows;
}

async function saveComment({
  repositoryId,
  pullRequestId,
  filePath,
  lineNumber,
  severity,
  body,
  embedding,
  githubCommentId = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO review_comments
       (repository_id, pull_request_id, file_path, line_number, severity, body, embedding, github_comment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [repositoryId, pullRequestId, filePath, lineNumber, severity, body, JSON.stringify(embedding), githubCommentId]
  );
  return rows[0].id;
}

module.exports = { findSimilarComments, saveComment };
