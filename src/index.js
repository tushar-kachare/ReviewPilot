require('dotenv').config();
const express = require('express');
const { createNodeMiddleware } = require('@octokit/webhooks');
const app = require('./github/app');
const { registerWebhookHandlers } = require('./github/webhookHandlers');

registerWebhookHandlers();

const server = express();

// Mount the Octokit-generated middleware, which handles signature
// verification and event routing to the handlers registered above.
server.use('/api/webhook', createNodeMiddleware(app.webhooks, { path: '/' }));

server.get('/', (req, res) => {
  res.send('ReviewPilot is running 🚀');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ReviewPilot listening on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/webhook`);
});
