const { embeddingModel } = require('./geminiClient');
 
/**
 * Generates a vector embedding for a piece of text (e.g. a review comment body).
 * gemini-embedding-001 defaults to 3072 dims, so we explicitly request 768
 * to match the `vector(768)` column in db/schema.sql. If you change the
 * embedding model or dimension, update the schema too.
 */
async function embedText(text) {
  const result = await embeddingModel.embedContent({
    content: { role: 'user', parts: [{ text }] },
    outputDimensionality: 768,
  });
  return result.embedding.values; // array of floats
}
 
module.exports = { embedText };
 