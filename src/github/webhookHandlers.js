// src/github/webhookHandlers.js
const app = require('./app');
const { runReview } = require('./reviewOrchestrator');

/**
 * Registers all webhook event listeners on the shared Octokit App instance.
 * Call this once at startup, before mounting the webhook middleware.
 */
function registerWebhookHandlers() {
  app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
    await handlePullRequestEvent(octokit, payload, { isIncremental: false });
  });

  app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
    // New commits pushed to an already-open PR — only review what's new.
    await handlePullRequestEvent(octokit, payload, { isIncremental: true });
  });

  app.webhooks.onError((error) => {
    console.error(`Webhook error for event ${error.event?.name}:`, error.message);
  });
}

async function handlePullRequestEvent(octokit, payload, { isIncremental }) {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.pull_request.number;

  console.log(
    `[ReviewPilot] ${isIncremental ? 'Incremental' : 'Full'} review triggered for ${owner}/${repo}#${pull_number}`
  );

  try {
    const result = await runReview(octokit, {
      owner,
      repo,
      pull_number,
      isIncremental,
      githubRepoId: payload.repository.id,
      installationId: payload.installation?.id,
    });

    console.log(
      `[ReviewPilot] Done: posted ${result.postedCount} comment(s), skipped ${result.skippedCount} duplicate(s) on ${owner}/${repo}#${pull_number}`
    );
  } catch (err) {
    console.error(`[ReviewPilot] Review failed for ${owner}/${repo}#${pull_number}:`, err);
  }
}

module.exports = { registerWebhookHandlers };
