// library that does the actual unified-diff text parsing for us
const parseDiff = require("parse-diff");

/**
 * Parses a unified diff string into a structured list of files with their
 * added lines, including the info GitHub's API needs to anchor an inline
 * review comment (file path + line number in the new version of the file).
 *
 * Returns: [{ filePath, addedLines: [{ lineNumber, content }], rawChunks }]
 */
function parseUnifiedDiff(diffText) {
  // hand raw diff text to the library, get back structured file objects
  const files = parseDiff(diffText);

  return files
    .filter((f) => !f.deleted) // skip deleted files, nothing to review
    .map((file) => {
      // git represents new files with from='/dev/null' — fall back to
      // file.from only in that edge case, otherwise use file.to (current path)
      const filePath = file.to !== "/dev/null" ? file.to : file.from;
      const addedLines = [];

      // a file can have multiple chunks (hunks); each chunk has every line
      // in that hunk — added, removed, or unchanged context
      for (const chunk of file.chunks) {
        for (const change of chunk.changes) {
          // 'add' = newly introduced line; 'normal' = unchanged context line.
          // We only want lines the author actually changed.
          //
          // NOTE: git has no "modified" line type — a changed line shows up
          // as a paired 'del' (old) + 'add' (new). We only keep the 'add'
          // side, so Gemini never sees what a modified line used to say —
          // it just looks like a freshly added line with no "before".
          if (change.type === "add") {
            addedLines.push({
              lineNumber: change.ln, // line number in the NEW file version —
              // this is what GitHub needs to anchor
              // the inline comment correctly
              content: change.content.slice(1), // strip the leading '+' so
              // we send clean code, not
              // diff-formatted text
            });
          }
        }
      }

      // chunks kept here for reference, but nothing downstream actually
      // uses raw chunks after this point
      return { filePath, addedLines, chunks: file.chunks };
    })
    .filter((f) => f.addedLines.length > 0); // drop files with nothing added
  // (e.g. pure deletions/renames)
}

/**
 * Builds a compact, line-numbered text representation of a file's added
 * lines for inclusion in the LLM prompt. Keeping line numbers explicit lets
 * the model report back accurate line numbers for inline comments.
 */
function formatFileForPrompt(file) {
  // "lineNumber: code" format — keeping the number inline means Gemini's
  // response can reference the same number, and we trust it directly when
  // posting the comment back to GitHub (no separate line-mapping step)
  const lines = file.addedLines
    .map((l) => `${l.lineNumber}: ${l.content}`)
    .join("\n");
  return `File: ${file.filePath}\n${lines}`;
}

module.exports = { parseUnifiedDiff, formatFileForPrompt };

/** This is eg of formated diff
 * File: src/foo.js
  42: const x = computeValue();
  43: return x * 2;
 */
