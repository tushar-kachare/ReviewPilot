// src/ai/geminiClient.js
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY is not set. AI review calls will fail.');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// gemini-2.5-flash is a good default: cheap, fast, large context window —
// good fit for diff review where most diffs are small-to-medium.
// Swap to gemini-2.5-pro if you need deeper reasoning on complex changes.
const reviewModel = genAI.getGenerativeModel({
  model: process.env.GEMINI_REVIEW_MODEL || 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
  },
});

const embeddingModel = genAI.getGenerativeModel({
  model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
});

module.exports = { genAI, reviewModel, embeddingModel };