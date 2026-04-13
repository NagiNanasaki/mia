import { normalizeModelPlainText } from '@/lib/trial';
import type { ChatCharacter } from '@/lib/chat-characters';

export const CALL_VOICE_IDS: Record<ChatCharacter, string> = {
  mia: 'mHX7OoPk2G45VMAuinIt',
  mimi: 'hO2yZ8lxM3axUxL8OeKX',
};

export const CALL_GREETING_OPTIONS: Record<ChatCharacter, string[]> = {
  mia: [
    'Hey, you actually called. My genius brain is ready, so go on.',
    'Oh, a call. I did sort of calculate you would do this.',
    "You rang? Right, let's hear it then.",
  ],
  mimi: [
    "oh, you called. bold move. I'm here though.",
    "it's a call. I knew that was going to happen.",
    "hello. I was literally about to say something evil, so this is good timing.",
  ],
};

export const CALL_FOLLOW_UP_GREETINGS: Record<ChatCharacter, string[]> = {
  mia: [
    'Mimi always says hello like a threat. Anyway, hi.',
    'Right, well, I sound more trustworthy already.',
    "What she said, but with better judgement.",
  ],
  mimi: [
    "what she said. only cooler.",
    'yeah hi, I was going to say that first actually.',
    "Mia got there first. typical. I'm still the fun one though.",
  ],
};

export type CallHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
  character?: ChatCharacter;
};

export function getOrCreateStoredId(key: string): string {
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function sanitizeCallReply(text: string): string {
  return normalizeModelPlainText(text)
    .replace(/\[(?:stamp|sticker|split|img|link):[^\]]+\]/gi, ' ')
    .replace(/[*_`#>[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toCallHistory(
  messages: Array<{ character: ChatCharacter | 'user'; content: string }>
): CallHistoryMessage[] {
  return messages.slice(-14).map((message) => ({
    role: message.character === 'user' ? 'user' : 'assistant',
    content: sanitizeCallReply(message.content),
    character: message.character === 'user' ? undefined : message.character,
  }));
}

export function pickRandomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? '';
}
