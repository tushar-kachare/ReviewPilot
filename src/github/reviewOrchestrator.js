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

  // always fetch fresh PR info — gives us title, description, headSha, baseSha
  const meta = await fetchPullRequestMeta(octokit, { owner, repo, pull_number });

  // make sure this repo has a row in our db, get its internal id
  const repositoryId = await upsertRepository({
    githubRepoId,
    fullName: `${owner}/${repo}`,
    installationId,
  });

  // make sure this PR has a row too — this has last_reviewed_sha (incase of incremental when PR is syncrhonized)
  const prRecord = await getOrCreatePullRequest({ repositoryId, prNumber: pull_number });

  let diffText;
  if (isIncremental && prRecord.last_reviewed_sha) {
    // incremental path — diff only between last reviewed commit and the new
    // head. cuts token costs since we skip re-sending already-reviewed code.
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
    // full path — brand new PR, or no prior review exists yet. get the whole diff.
    diffText = await fetchPullRequestDiff(octokit, { owner, repo, pull_number });
  }

  // turn raw diff text into structured files + added lines
  const parsedFiles = parseUnifiedDiff(diffText);

  // nothing changed worth reviewing (e.g. only deletions) — still bump the
  // sha forward so next diff doesn't compare against a stale commit
  if (parsedFiles.length === 0) {
    await updateLastReviewedSha({ pullRequestId: prRecord.id, sha: meta.headSha });
    return { postedCount: 0, skippedCount: 0 };
  }

  // one single call — send everything to gemini, get back findings per file
  const reviewedFiles = await analyzeDiff(parsedFiles, {
    prTitle: meta.title,
    prDescription: meta.description,
  });

  let postedCount = 0;
  let skippedCount = 0;

  // go through every finding gemini gave us, one at a time
  for (const file of reviewedFiles) {
    for (const finding of file.findings) {

      // turn this finding's comment into a vector for similarity matching
      const embedding = await embedText(finding.comment);

      // check review memory: has something near-identical already been
      // flagged on this file in this repo before? if so, skip posting again.
      const similar = await findSimilarComments({
        repositoryId,
        filePath: file.filePath,
        embedding,
      });

      if (similar.length > 0) {
        skippedCount++;
        continue; // duplicate — don't post, don't save, move to next finding
      }

      // add severity emoji + label to make the final markdown body
      const body = formatSeverityComment(finding);

      // post it live to github, anchored to this file+line on the latest commit
      const { data: postedComment } = await postInlineComment(octokit, {
        owner,
        repo,
        pull_number,
        commitSha: meta.headSha,
        filePath: file.filePath,
        line: finding.lineNumber,
        body,
      });

      // save it to db so future reviews can dedup against it
      // (note: this runs AFTER posting — if this fails, comment is live on
      // github but has no db record, so dedup won't catch it next time)
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

  // mark this commit as reviewed — next synchronize event will diff from here
  await updateLastReviewedSha({ pullRequestId: prRecord.id, sha: meta.headSha });

  return { postedCount, skippedCount };
}

module.exports = { runReview };