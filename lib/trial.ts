export type TrialEvidenceItem = {
  id: string;
  label: string;
  content: string;
  isRelevant: boolean;
};

export type TrialHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type TrialExchangeMessage = {
  role: 'user' | 'mimi';
  content: string;
};

export const TRIAL_RECENT_MESSAGES_KEY = 'mia_trial_recent_messages';

export const DEFAULT_TRIAL_CHARGES = [
  "using 'literally' incorrectly. I have witnesses.",
  'sending a message at a suspicious hour. very suspicious.',
  'asking too many questions. it is exhausting.',
  'not laughing at my joke. I timed it perfectly.',
  "pretending you didn't understand something you clearly understood.",
  'taking too long to reply. I was waiting.',
  'using a comma wrong. I noticed.',
  "typing 'lol' without actually laughing. fraud.",
  'having better grammar than me. not allowed.',
  'making Mia agree with you. she was mine first.',
];

export function cleanTrialContent(value: string): string {
  return value
    .replace(/\[(?:stamp|sticker|user-stamp):[^\]]+\]/gi, '')
    .replace(/\[link:[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeModelPlainText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .trim();
}

export function normalizeTrialRecentMessages(messages: TrialHistoryMessage[]): TrialHistoryMessage[] {
  return messages
    .map((message) => ({
      role: (message.role === 'user' ? 'user' : 'assistant') as TrialHistoryMessage['role'],
      content: normalizeModelPlainText(cleanTrialContent(message.content)),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-10);
}

export function parseVerdictOutcome(text: string): 'guilty' | 'not_guilty' | 'dismissed' {
  const normalized = text.toLowerCase();
  if (normalized.includes('case dismissed') || normalized.includes('dismissed')) return 'dismissed';
  if (normalized.includes('not guilty')) return 'not_guilty';
  return 'guilty';
}
