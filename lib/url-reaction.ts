export const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;

export function extractFirstUrl(text: string): string | null {
  return text.match(URL_REGEX)?.[0] ?? null;
}

export function getDomainLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '');
  } catch {
    return 'unknown source';
  }
}

export function buildUrlReactionContext(input: {
  title: string | null;
  summary: string | null;
  domain: string;
  success: boolean;
}): string {
  const { title, summary, domain, success } = input;

  if (!success) {
    return `[URL shared by user]
Source: ${domain}
(You couldn't read the content. React based on what you know about this site/source.)`;
  }

  const safeTitle = title ? `"${title}"` : '"Untitled page"';
  const safeSummary = summary?.trim() ? summary.trim() : 'No summary available.';

  return `[URL shared by user]
Title: ${safeTitle}
Summary: ${safeSummary}
Source: ${domain}
(React to this content naturally - give your honest take. Don't summarise the article back to the user. If it fits naturally, invite them to discuss.)`;
}
