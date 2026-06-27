require('dotenv').config();
const { App } = require('@octokit/app');
const fs = require('fs');

function loadPrivateKey() {
  if (process.env.GITHUB_PRIVATE_KEY) {
    // Useful for deployment platforms where you store the PEM as an env var
    // (with literal \n that need converting to real newlines).
    return process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  if (process.env.GITHUB_PRIVATE_KEY_PATH) {
    return fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, 'utf8');
  }
  throw new Error(
    'No GitHub App private key found. Set GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH in .env'
  );
}

const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: loadPrivateKey(),
  webhooks: {
    secret: process.env.GITHUB_WEBHOOK_SECRET,
  },
});

module.exports = app;
