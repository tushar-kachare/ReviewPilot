/**
 * Fetches the unified diff for a pull request.
 * Uses the special "diff" media type so Octokit returns raw diff text
 * instead of the JSON file list.
 */
async function fetchPullRequestDiff(octokit, { owner, repo, pull_number }) {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number,
      mediaType: { format: "diff" },
    },
  );
  return data; // raw diff string
}

/**
 * Fetches PR metadata (title, description, head sha) needed for context
 * and for incremental-diff tracking.
 */
async function fetchPullRequestMeta(octokit, { owner, repo, pull_number }) {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner,
      repo,
      pull_number,
    },
  );
  return {
    title: data.title,
    description: data.body,
    headSha: data.head.sha,
    baseSha: data.base.sha,
  };
}

/**  
  we need this 2 functions/separate API to get metadata and diff cuz we cant do it in single api as
  so there's no single call that gives you both; two functions reflect two genuinely separate API responses.
  
 ** //
 
/**
 * Posts a single inline review comment anchored to a specific file+line
 * on the PR's latest commit.
 */
async function postInlineComment(
  octokit,
  { owner, repo, pull_number, commitSha, filePath, line, body },
) {
  return octokit.request(
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
    {
      owner,
      repo,
      pull_number,
      commit_id: commitSha,
      path: filePath,
      line,
      body,
    },
  );
}

module.exports = {
  fetchPullRequestDiff,
  fetchPullRequestMeta,
  postInlineComment,
};
