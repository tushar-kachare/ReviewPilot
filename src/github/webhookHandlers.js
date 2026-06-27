
// shared App instance — we need app.webhooks to attach listeners on
const app = require('./app');

// actual review logic (diff -> gemini -> dedup -> post -> save) lives here
const { runReview } = require('./reviewOrchestrator');

// attaches listeners on app.webhooks — called once at startup, before
// index.js mounts the middleware. doesn't run anything itself yet.
function registerWebhookHandlers() {

  // fires when a brand new PR is opened. octokit here is already
  // authenticated (JWT + installation token exchange already happened
  // internally) — we just get a ready-to-use client.
  app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
    // no prior review to diff against, so review the whole PR
    await handlePullRequestEvent(octokit, payload, { isIncremental: false });
  });

  app.webhooks.on('pull_request.synchronize', async ({ octokit, payload }) => {
    // new commits pushed to an already-open PR — only review what's new
    await handlePullRequestEvent(octokit, payload, { isIncremental: true });
  });

  // catches errors in webhook dispatch itself, not our review logic
  app.webhooks.onError((error) => {
    console.error(`Webhook error for event ${error.event?.name}:`, error.message);
  });
}

// shared by both listeners above so "opened" and "synchronize" don't
// duplicate logic — only isIncremental differs
async function handlePullRequestEvent(octokit, payload, { isIncremental }) {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pull_number = payload.pull_request.number;

  console.log(
    `[ReviewPilot] ${isIncremental ? 'Incremental' : 'Full'} review triggered for ${owner}/${repo}#${pull_number}`
  );

  try {
    // entire pipeline runs inside here — fetch diff, gemini analysis,
    // pgvector dedup check, post comment, save to db, update last_reviewed_sha
    const result = await runReview(octokit, {
      owner,
      repo,
      pull_number,
      isIncremental,
      githubRepoId: payload.repository.id,
      installationId: payload.installation?.id, // optional chain in case it's missing
    });

    console.log(
      `[ReviewPilot] Done: posted ${result.postedCount} comment(s), skipped ${result.skippedCount} duplicate(s) on ${owner}/${repo}#${pull_number}`
    );
  } catch (err) {
    // only safety net for the whole pipeline — logged, not retried or alerted
    console.error(`[ReviewPilot] Review failed for ${owner}/${repo}#${pull_number}:`, err);
  }
}

module.exports = { registerWebhookHandlers };