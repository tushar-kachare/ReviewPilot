// src/utils/formatComment.js

const SEVERITY_EMOJI = {
  critical: '🔴',
  major: '🟠',
  minor: '🟡',
  nit: '🔵',
  praise: '✅',
};

const SEVERITY_LABEL = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  nit: 'Nit',
  praise: 'Praise',
};

/**
 * Formats a finding into the final markdown body posted as a GitHub
 * inline review comment, tagged with severity.
 */
function formatSeverityComment({ severity, comment }) {
  const emoji = SEVERITY_EMOJI[severity] || '⚪';
  const label = SEVERITY_LABEL[severity] || severity;
  return `${emoji} **${label}** (ReviewPilot)\n\n${comment}`;
}

module.exports = { formatSeverityComment };
