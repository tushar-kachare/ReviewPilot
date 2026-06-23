// src/github/reviewOrchestrator.js
const { fetchPullRequestDiff, fetchPullRequestMeta, postInlineComment } = require('./prService');
const { parseUnifiedDiff } = require('../utils/diffParser');
const { analyzeDiff } = require('../ai/reviewAnalyzer');
const { embedText } = require('../ai/embeddings');
const { formatSeverityComment } = require('../utils/formatComment');
const { upsertRepository, getOrCreatePullRequest, updateLastReviewedSha } = require('../db/repositories');
const { findSimilarComments, saveComment } = require('../db/reviewComments');

/**
 * Runs a full review pass for a PR event (opened, or new commits pushed).
 *
 * Incremental analysis: on `synchronize` events (new commits pushed to an
 * existing PR), GitHub's diff endpoint still returns the full PR diff against
 * the base branch — not just the newest push. To keep token costs down, we
 * only re-analyze files/lines that are part of the diff between the
 * previously-reviewed head SHA and the new head SHA, rather than the whole
 * PR diff. This means on `opened` we review everything; on `synchronize` we
 * review only what's new.
 */
async function runReview(octokit, { owner, repo, pull_number, isIncremental, githubRepoId, installationId }) {
  const meta = await fetchPullRequestMeta(octokit, { owner, repo, pull_number });

  const repositoryId = await upsertRepository({
    githubRepoId,
    fullName: `${owner}/${repo}`,
    installationId,
  });

  const prRecord = await getOrCreatePullRequest({ repositoryId, prNumber: pull_number });

  let diffText;
  if (isIncremental && prRecord.last_reviewed_sha) {
    // Diff only between last reviewed commit and the new head — this is the
    // "incremental diff analysis" optimization that cuts token costs on
    // PR updates, since we skip re-sending already-reviewed code.
    const { data } = await octokit.request(
      'GET /repos/{owner}/{repo}/compare/{basehead}',
      {
        owner,
        repo,
        basehead: `${prRecord.last_reviewed_sha}...${meta.headSha}`,
        mediaType: { format: 'diff' },
      }
    );
    diffText = data;
  } else {
    diffText = await fetchPullRequestDiff(octokit, { owner, repo, pull_number });
  }

  const parsedFiles = parseUnifiedDiff(diffText);
  if (parsedFiles.length === 0) {
    await updateLastReviewedSha({ pullRequestId: prRecord.id, sha: meta.headSha });
    return { postedCount: 0, skippedCount: 0 };
  }

  const reviewedFiles = await analyzeDiff(parsedFiles, {
    prTitle: meta.title,
    prDescription: meta.description,
  });

  let postedCount = 0;
  let skippedCount = 0;

  for (const file of reviewedFiles) {
    for (const finding of file.findings) {
      const embedding = await embedText(finding.comment);

      // Check review memory: has something near-identical already been
      // flagged on this file in this repo before? If so, skip posting again.
      const similar = await findSimilarComments({
        repositoryId,
        filePath: file.filePath,
        embedding,
      });

      if (similar.length > 0) {
        skippedCount++;
        continue;
      }

      const body = formatSeverityComment(finding);

      const { data: postedComment } = await postInlineComment(octokit, {
        owner,
        repo,
        pull_number,
        commitSha: meta.headSha,
        filePath: file.filePath,
        line: finding.lineNumber,
        body,
      });

      await saveComment({
        repositoryId,
        pullRequestId: prRecord.id,
        filePath: file.filePath,
        lineNumber: finding.lineNumber,
        severity: finding.severity,
        body: finding.comment,
        embedding,
        githubCommentId: postedComment.id,
      });

      postedCount++;
    }
  }

  await updateLastReviewedSha({ pullRequestId: prRecord.id, sha: meta.headSha });

  return { postedCount, skippedCount };
}

module.exports = { runReview };
