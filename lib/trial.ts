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
  'ending a sentence with a period. very passive aggressive.',
  'using a big word incorrectly on purpose to seem smart.',
  'sending a one-word reply and expecting me to figure out the rest.',
  'changing the subject right as I was getting to my point.',
  'laughing at something that was not funny. encouraging bad behaviour.',
  'asking what I meant after I said something perfectly clear.',
  'using an ellipsis in a threatening manner.',
  'reading my message and waiting three minutes before replying.',
  'saying "interesting" without explaining what was interesting about it.',
  'starting a sentence with "well, actually" — twice.',
  'going offline right before I sent an important message.',
  'quoting me incorrectly and then arguing about it.',
  'typing too fast. deeply suspicious.',
  'using the wrong "there/their/they\'re" and not apologising.',
  'sending a voice note when I clearly wanted a text.',
  'asking "are you sure?" as if I am ever not sure.',
  'pretending to agree just to end the argument. cowardice.',
  'sighing audibly through text. impressive and rude.',
  'having a better comeback than me. unacceptable.',
  'typing "haha" with exactly zero joy behind it.',
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
