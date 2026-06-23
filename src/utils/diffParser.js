// src/utils/diffParser.js
const parseDiff = require('parse-diff');

/**
 * Parses a unified diff string into a structured list of files with their
 * added lines, including the info GitHub's API needs to anchor an inline
 * review comment (file path + line number in the new version of the file).
 *
 * Returns: [{ filePath, addedLines: [{ lineNumber, content }], rawChunks }]
 */
function parseUnifiedDiff(diffText) {
  const files = parseDiff(diffText);

  return files
    .filter((f) => !f.deleted) // skip deleted files, nothing to review
    .map((file) => {
      const filePath = file.to !== '/dev/null' ? file.to : file.from;
      const addedLines = [];

      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          // 'add' = newly introduced line; 'normal' = unchanged context line.
          // We only want lines the author actually changed.
          if (change.type === 'add') {
            addedLines.push({
              lineNumber: change.ln, // line number in the new file version
              content: change.content.slice(1), // strip the leading '+'
            });
          }
        }
      }

      return { filePath, addedLines, chunks: file.chunks };
    })
    .filter((f) => f.addedLines.length > 0);
}

/**
 * Builds a compact, line-numbered text representation of a file's added
 * lines for inclusion in the LLM prompt. Keeping line numbers explicit lets
 * the model report back accurate line numbers for inline comments.
 */
function formatFileForPrompt(file) {
  const lines = file.addedLines.map((l) => `${l.lineNumber}: ${l.content}`).join('\n');
  return `File: ${file.filePath}\n${lines}`;
}

module.exports = { parseUnifiedDiff, formatFileForPrompt };
