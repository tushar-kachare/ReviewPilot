// src/ai/reviewAnalyzer.js
const { reviewModel } = require('./geminiClient');
const { formatFileForPrompt } = require('../utils/diffParser');

const SEVERITY_LEVELS = ['critical', 'major', 'minor', 'nit', 'praise'];

const SYSTEM_INSTRUCTIONS = `You are ReviewPilot, an expert automated code reviewer.
You review ONLY the newly added/changed lines provided to you (given with their
exact line numbers from the file's new version). For each file, identify
concrete, actionable issues — do not invent line numbers, and do not comment on
lines that were not provided.

Severity levels you must use (exactly one per finding):
- "critical": bugs, security vulnerabilities, data loss, crashes
- "major": logic errors, broken edge cases, significant design problems
- "minor": code quality, maintainability, minor inefficiencies
- "nit": style, naming, formatting, nitpicks
- "praise": optional — call out something done particularly well

Respond ONLY with valid JSON matching this exact shape, no markdown fences, no prose:
{
  "files": [
    {
      "filePath": "string",
      "findings": [
        {
          "lineNumber": number,
          "severity": "critical" | "major" | "minor" | "nit" | "praise",
          "comment": "string - concise, actionable, 1-3 sentences"
        }
      ]
    }
  ]
}

If a file has no notable findings, omit it or return an empty findings array.
Do not pad with low-value comments just to have something to say.`;

/**
 * Sends parsed diff files to Gemini and returns structured findings.
 * @param {Array} parsedFiles - output of parseUnifiedDiff()
 * @param {Object} context - optional extra context, e.g. { prTitle, prDescription }
 */
async function analyzeDiff(parsedFiles, context = {}) {
  const filesBlock = parsedFiles.map(formatFileForPrompt).join('\n\n---\n\n');

  const contextBlock = context.prTitle
    ? `PR Title: ${context.prTitle}\nPR Description: ${context.prDescription || '(none)'}\n\n`
    : '';

  const prompt = `${SYSTEM_INSTRUCTIONS}\n\n${contextBlock}Review the following changed lines:\n\n${filesBlock}`;

  const result = await reviewModel.generateContent(prompt);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 300)}`);
  }

  // Defensive validation/cleanup
  const files = (parsed.files || []).map((f) => ({
    filePath: f.filePath,
    findings: (f.findings || []).filter(
      (finding) =>
        typeof finding.lineNumber === 'number' &&
        SEVERITY_LEVELS.includes(finding.severity) &&
        typeof finding.comment === 'string' &&
        finding.comment.trim().length > 0
    ),
  }));

  return files;
}

module.exports = { analyzeDiff, SEVERITY_LEVELS };
