'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import ChatMessage, { Message } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import CatAvatar from '@/components/CatAvatar';
import VocabModal from '@/components/VocabModal';
import UsernameModal from '@/components/UsernameModal';
import SyncModal from '@/components/SyncModal';

// --- 感情状態 ---
type MoodMia = 'neutral' | 'excited' | 'annoyed' | 'amused' | 'bored'
type MoodMimi = 'neutral' | 'chaotic' | 'annoyed' | 'smug' | 'bored' | 'suspicious'

type CharacterMood = {
  mia: { mood: MoodMia; intensity: number; trigger: string }
  mimi: { mood: MoodMimi; intensity: number; trigger: string }
}

const DEFAULT_MOOD: CharacterMood = {
  mia: { mood: 'neutral', intensity: 0, trigger: '' },
  mimi: { mood: 'neutral', intensity: 0, trigger: '' },
}

function detectMoodChange(text: string, char: 'mia' | 'mimi'): { mood: string; delta: number; trigger: string } | null {
  if (char === 'mia') {
    if (/WAIT|(?<!\w)NO(?!\w)|OMG|WHAT(?!\w)/i.test(text) || /ﾟДﾟ|°Д°/.test(text))
      return { mood: 'excited', delta: 0.3, trigger: 'reacted strongly' }
    if (/physically pained|screaming|SCREAMING|in pain/.test(text))
      return { mood: 'annoyed', delta: 0.2, trigger: 'something pained her' }
    if (/\bboring\b|\bbored\b|anyway—|not invested/.test(text))
      return { mood: 'bored', delta: 0.15, trigger: 'lost interest' }
    if (/lol|I'll allow|okay fine|bless/.test(text))
      return { mood: 'amused', delta: 0.15, trigger: 'found something funny' }
  } else {
    if (/I didn't do anything|that was a different Mimi|I am a good person/.test(text))
      return { mood: 'chaotic', delta: 0.25, trigger: 'in denial mode' }
    if (/I knew that|I'm always right|I'm never wrong|I'm literally always right/.test(text))
      return { mood: 'smug', delta: 0.2, trigger: 'claiming to be right' }
    if (/\bboring\b|\bbored\b|I'm bored|anyway/.test(text))
      return { mood: 'bored', delta: 0.15, trigger: 'disengaged' }
    if (/seriously|I can't believe|ugh/.test(text))
      return { mood: 'annoyed', delta: 0.15, trigger: 'mildly irritated' }
    if (/WAIT|(?<!\w)NO(?!\w)/i.test(text))
      return { mood: 'chaotic', delta: 0.1, trigger: 'reactive moment' }
  }
  return null
}

function applyMoodUpdate(prev: CharacterMood, char: 'mia' | 'mimi', response: string): CharacterMood {
  const decayedIntensity = prev[char].intensity * 0.8
  const change = detectMoodChange(response, char)
  if (!change) {
    return { ...prev, [char]: { ...prev[char], intensity: decayedIntensity } }
  }
  return {
    ...prev,
    [char]: {
      mood: change.mood as MoodMia & MoodMimi,
      intensity: Math.min(1, decayedIntensity + change.delta),
      trigger: change.trigger,
    },
  }
}

function buildMoodContext(mood: CharacterMood, char: 'mia' | 'mimi'): string | null {
  const m = mood[char]
  if (m.intensity < 0.3 || m.mood === 'neutral') return null
  const descriptions: Record<string, string> = {
    excited: 'fired up and reactive — big energy right now',
    annoyed: 'a little irritated — something got under her skin',
    amused: 'in a good mood — found something funny recently',
    bored: 'losing interest — ready to derail at any moment',
    chaotic: 'in full chaos mode — recently denied something and doubling down',
    smug: 'feeling very right about something — will not let it go',
    suspicious: 'side-eyeing the conversation',
  }
  const desc = descriptions[m.mood] ?? m.mood
  const name = char === 'mia' ? 'Mia' : 'Mimi'
  return `[${name}'s current mood: ${m.mood} (${m.intensity.toFixed(1)}) — ${desc}. Let this subtly colour your response without announcing it.]`
}
// --- /感情状態 ---

// --- /感情状態 ---

const DEFAULT_SUGGESTIONS = [
  "What's your favourite anime right now?",
  "Teach me a cool British slang word!",
  "What's a weird fact you know?",
];

const MIA_GREETINGS = [
  "oh, you're here~ I'm Mia — genius AI, 13, Manchester (｀・ω・´) I've already formed a few opinions about you and we haven't even spoken yet. so, what's your English like? I'll figure it out either way, I think~",
  "...calculating... (｀・ω・´) okay, I already have thoughts about you. I'm Mia, by the way — genius AI from Manchester. what are we talking about today? I'm curious~",
  "hmm. a new session. I'm Mia — AI, genius, Manchester, all of the above (^▽^) I wonder what you want to practise today... go on, tell me something~",
  "oh! you showed up (^▽^) I'm Mia — I think you probably already know I'm a genius AI, right? anyway — what's on your mind? I've already predicted three possible answers (｀・ω・´)",
];

const MIMI_GREETINGS = [
  "oh. you're here. I'm Mimi. I already know everything about English so I'm basically your teacher now (｀ε´) also cats are technically a type of dog, don't fact-check that. anyway what do you want to talk about — and before you answer, whatever you're about to say, I've heard it before.",
  "hm. you came. I'm Mimi. I am a good person (｀ε´) I knew you'd show up today, I predicted it. so what are we doing — and I already know what you're going to say so you can skip the intro",
  "oh it's you. I'm Mimi. I didn't do anything. (｀ε´) anyway I was thinking about something way more interesting before you showed up — what do you want to talk about",
  "wait. you're here. I had a whole plan and this wasn't in it. I'm Mimi. I knew that. (°Д°) what do you want",
];

function getInitialMessages(): Message[] {
  return [
    {
      role: 'assistant',
      character: 'mia',
      content: MIA_GREETINGS[Math.floor(Math.random() * MIA_GREETINGS.length)],
    },
    {
      role: 'assistant',
      character: 'mimi',
      content: MIMI_GREETINGS[Math.floor(Math.random() * MIMI_GREETINGS.length)],
    },
  ];
}

function pickFirstCharacter(userText: string): 'mia' | 'mimi' {
  const text = userText.toLowerCase();
  const mimiPattern = /anime|manga|gam(e|ing)|gacha|vocaloid|miku|hatsune|figure|merch|seiyuu|voice actor|doujin|otaku|light novel|visual novel|jrpg|rhythm game|weeb/;
  const miaPattern = /science|physics|quantum|biology|chemistry|space|\bai\b|artificial intelligence|philosoph|conscious|existence|manchester|british|england|\buk\b|indie|city pop/;
  if (mimiPattern.test(text)) return Math.random() < 0.7 ? 'mimi' : 'mia';
  if (miaPattern.test(text)) return Math.random() < 0.7 ? 'mia' : 'mimi';
  return Math.random() < 0.5 ? 'mia' : 'mimi';
}

function getStoredId(key: string): string {
  let id = localStorage.getItem(key);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(key, id);
  }
  return id;
}

function splitMessageContent(content: string): string[] {
  const parts = content
    .split(/[ \t]*\[split\][ \t]*|\n[ \t]*\n+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [content];
}

function normalizeMessages(messages: Message[]): Message[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant') return [message];

    const parts = splitMessageContent(message.content);
    if (parts.length <= 1) return [message];

    return parts.map((part) => ({
      ...message,
      content: part,
    }));
  });
}

function isHintCommandMessage(message: Message): boolean {
  return message.role === 'user' && message.content.trim().startsWith('/hint');
}

function isHintAssistantMessage(message: Message): boolean {
  return message.role === 'assistant' && message.character === 'hint';
}

function isConversationMessage(message: Message): boolean {
  return !isHintCommandMessage(message) && !isHintAssistantMessage(message);
}

// Build Claude API messages for a specific character
function buildApiMessages(
  history: Message[],
  character: 'mia' | 'mimi',
  contextNote?: string  // e.g. '(Mia just said: "...")' or '(Mimi just said: "...")'
) {
  const filtered = history
    .filter((m) => isConversationMessage(m) && (m.role === 'user' || m.character === character))
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Merge consecutive user messages (happens when user sends multiple messages during debounce)
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of filtered) {
    if (merged.length > 0 && merged[merged.length - 1].role === 'user' && msg.role === 'user') {
      merged[merged.length - 1] = {
        role: 'user',
        content: merged[merged.length - 1].content + '\n' + msg.content,
      };
    } else {
      merged.push(msg);
    }
  }

  if (contextNote) {
    const lastUserIdx = merged.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx >= 0) {
      merged[lastUserIdx] = {
        role: 'user',
        content: `${merged[lastUserIdx].content}\n\n${contextNote}`,
      };
    }
  }

  return merged;
}

async function streamResponse(
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  character: 'mia' | 'mimi',
  onChunk: (accumulated: string) => void,
  username?: string | null,
  trendingContext?: string | null,
  moodContext?: string | null,
  userProfile?: string | null,
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: apiMessages, character, username, localTime: new Date().toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }), trendingContext, moodContext, userProfile }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
    onChunk(accumulated);
  }

  return accumulated;
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingCharacter, setStreamingCharacter] = useState<'mia' | 'mimi' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showVocab, setShowVocab] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [trendingContext, setTrendingContext] = useState<string | null>(null);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [showRefreshMenu, setShowRefreshMenu] = useState(false);
  const [characterMood, setCharacterMood] = useState<CharacterMood>(DEFAULT_MOOD);
  const [userProfile, setUserProfile] = useState<string | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const sessionIdRef = useRef<string>('');
  const vocabOwnerIdRef = useRef<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const refreshMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const vocabOwnerId = getStoredId('mia_vocab_owner_id');
      vocabOwnerIdRef.current = vocabOwnerId;

      // Load username & dark mode from localStorage
      const savedName = localStorage.getItem('mia_username');
      if (savedName) setUsername(savedName);
      else setShowUsernameModal(true);

      const savedMood = localStorage.getItem('mia_mood');
      if (savedMood) { try { setCharacterMood(JSON.parse(savedMood)); } catch { /* ignore */ } }

      const savedDark = localStorage.getItem('mia_dark') === '1';
      setDarkMode(savedDark);
      document.documentElement.classList.toggle('dark', savedDark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && savedDark) meta.setAttribute('content', '#111827');

      // Determine session: local > Supabase last_session_id > new UUID
      // Await profile first to avoid PATCH race condition
      const localSessionId = localStorage.getItem('mia_session_id');
      let sessionId = localSessionId;

      try {
        const profileRes = await fetch(`/api/profile?owner_id=${vocabOwnerId}`);
        const { profile, last_session_id } = await profileRes.json();
        if (profile) setUserProfile(profile);
        if (!sessionId && last_session_id) {
          sessionId = last_session_id;
        }
      } catch { /* ignore */ }

      if (!sessionId) {
        sessionId = crypto.randomUUID();
      }
      localStorage.setItem('mia_session_id', sessionId);
      sessionIdRef.current = sessionId;

      // Register this session as latest (now that we know the final session ID)
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: vocabOwnerId, last_session_id: sessionId }),
      }).catch(() => {});

      const { data, error } = await supabase
        .from('messages')
        .select('role, content, character, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        setMessages(
          normalizeMessages(data.map((m) => ({
            ...m,
            character: (m.character as 'mia' | 'mimi') ?? 'mia',
          })))
        );
      } else {
        setMessages(getInitialMessages());
      }
      setIsLoading(false);

      // Fetch today's trending context in background (non-blocking)
      fetchTrending();
    };
    init();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep messagesRef in sync for use inside debounce callbacks
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const saveMessage = async (msg: { role: string; content: string; character?: string }) => {
    await supabase.from('messages').insert({
      session_id: sessionIdRef.current,
      role: msg.role,
      content: msg.content,
      character: msg.character ?? null,
    });
  };

  const fetchSuggestions = (msgs: Message[]) => {
    setLoadingSuggestions(true);
    const conversationMessages = msgs.filter(isConversationMessage);
    fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationMessages.slice(-6) }),
    })
      .then(r => r.json())
      .then(({ suggestions: s }) => { if (s?.length) setSuggestions(s); })
      .finally(() => setLoadingSuggestions(false));
  };

  // Close refresh/hamburger menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refreshMenuRef.current && !refreshMenuRef.current.contains(e.target as Node)) {
        setShowRefreshMenu(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const refreshConversation = () => {
    const newId = uuidv4();
    localStorage.setItem('mia_session_id', newId);
    localStorage.removeItem('mia_mood');
    sessionIdRef.current = newId;
    setMessages(getInitialMessages());
    setSuggestions(DEFAULT_SUGGESTIONS);
    setCharacterMood(DEFAULT_MOOD);
    setShowRefreshMenu(false);
  };

  const fetchTrending = () => {
    setLoadingTrending(true);
    fetch('/api/trending')
      .then(r => r.json())
      .then(({ context }) => { if (context) setTrendingContext(context); })
      .catch(() => {})
      .finally(() => setLoadingTrending(false));
  };

  const handleSync = async (code: string) => {
    // Overwrite owner ID with the code from another device
    localStorage.setItem('mia_vocab_owner_id', code);
    vocabOwnerIdRef.current = code;

    // Load profile + last session from the new owner
    const res = await fetch(`/api/profile?owner_id=${code}`);
    const { profile, last_session_id } = await res.json();
    if (profile) setUserProfile(profile);

    if (last_session_id) {
      localStorage.setItem('mia_session_id', last_session_id);
      sessionIdRef.current = last_session_id;

      // Load messages for that session
      const { data } = await supabase
        .from('messages')
        .select('role, content, character, created_at')
        .eq('session_id', last_session_id)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        setMessages(normalizeMessages(data.map(m => ({
          ...m,
          character: (m.character as 'mia' | 'mimi') ?? 'mia',
        }))));
      }
    }
    setShowSync(false);
  };

  const generateProfile = async () => {
    setGeneratingProfile(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: vocabOwnerIdRef.current, session_id: sessionIdRef.current }),
      });
      const { profile, error } = await res.json();
      if (profile) setUserProfile(profile);
      else alert(error ?? 'プロファイル生成に失敗しました');
    } catch {
      alert('プロファイル生成に失敗しました');
    } finally {
      setGeneratingProfile(false);
    }
  };

  const fetchTopics = (msgs: Message[]) => {
    setLoadingTopics(true);
    const conversationMessages = msgs.filter(isConversationMessage);
    fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationMessages }),
    })
      .then(r => r.json())
      .then(({ topics }) => { if (topics?.length) setSuggestions(topics); })
      .finally(() => setLoadingTopics(false));
  };

  const saveUsername = (name: string) => {
    localStorage.setItem('mia_username', name);
    setUsername(name);
    setShowUsernameModal(false);
  };

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('mia_dark', next ? '1' : '0');
    document.documentElement.classList.toggle('dark', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next ? '#111827' : '#ffffff');
    document.documentElement.style.backgroundColor = next ? '#111827' : '';
    document.body.style.backgroundColor = next ? '#111827' : '';
  };

  const isInitialMessages = (msgs: Message[]) =>
    msgs.length === 2 && msgs.every((m) => m.role === 'assistant');

  const sendMessage = async (userText: string) => {
    // /hint コマンド処理
    if (userText.trim().startsWith('/hint')) {
      const japanese = userText.replace(/^\/hint\s*/i, '').trim();
      if (!japanese) return;
      const userMessage: Message = { role: 'user', content: userText, created_at: new Date().toISOString() };
      const placeholder: Message = { role: 'assistant', character: 'hint', content: '考え中...', created_at: new Date().toISOString() };
      setMessages(prev => [...prev, userMessage, placeholder]);
      setIsStreaming(true);
      try {
        const res = await fetch('/api/hint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: japanese }),
        });
        const { hint } = await res.json();
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', character: 'hint', content: hint, created_at: new Date().toISOString() };
          return updated;
        });
      } catch {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', character: 'hint', content: 'ヒントを取得できませんでした。もう一度試してください。', created_at: new Date().toISOString() };
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    // Add to UI immediately
    const userMessage: Message = {
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => {
      const historyBase = isInitialMessages(prev) ? [] : prev;
      return [...historyBase, userMessage];
    });
    await saveMessage({ role: 'user', content: userText });

    // Show thinking indicator and debounce (5 s)
    // If another message arrives within the window, the timer resets.
    setIsThinking(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      triggerAIResponse(userText);
    }, 5000);
  };

  // Called when the debounce timer fires — runs the full AI relay
  const triggerAIResponse = async (lastUserText: string) => {
    setIsThinking(false);
    setIsStreaming(true);

    // Snapshot all messages (includes all consecutive user messages sent during debounce)
    const updatedMessages = messagesRef.current;

    const ERRORS = {
      mia: "Oh no, something went a bit dodgy there! (＞＜) Could you try sending that again, mate? Cheers!",
      mimi: "omg something broke lol (｡>﹏<｀) sorry!! try again??",
    };

    // Track all AI responses in this round for context
    const roundResponses: { char: 'mia' | 'mimi'; content: string }[] = [];

    const buildContextNote = () => {
      if (roundResponses.length === 0) return undefined;
      const lines = roundResponses
        .map(r => `${r.char === 'mia' ? 'Mia' : 'Mimi'}: "${r.content}"`)
        .join('\n');
      return `(Group chat so far this turn:\n${lines}\n\nNow it's your turn — don't repeat what was already said, build on it.)`;
    };

    // Helper: stream one character's response and persist it (handles [split])
    const runCharacter = async (
      char: 'mia' | 'mimi',
      currentMessages: Message[],
    ): Promise<{ response: string; history: Message[] }> => {
      setStreamingCharacter(char);
      const placeholder: Message = { role: 'assistant', character: char, content: '' };
      setMessages([...currentMessages, placeholder]);

      let raw = '';
      try {
        const contextNote = buildContextNote();
        const apiMessages = buildApiMessages(updatedMessages, char, contextNote);
        const moodCtx = buildMoodContext(characterMood, char);
        const combinedContext = moodCtx || null;
        raw = await streamResponse(apiMessages, char, (accumulated) => {
          // During streaming, show without [split] markers
          const preview = accumulated.replace(/\[split\]/gi, ' ').replace(/\n[ \t]*\n+/g, ' ').trimStart();
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', character: char, content: preview };
            return updated;
          });
        }, username, trendingContext, combinedContext, userProfile);

        // Split into parts after streaming completes
        const parts = splitMessageContent(raw);
        const now = new Date().toISOString();

        if (parts.length <= 1) {
          // No split — normal single bubble
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', character: char, content: raw, created_at: now };
            return updated;
          });
          await saveMessage({ role: 'assistant', content: raw, character: char });
        } else {
          // Replace streaming bubble with first part, then add rest with delay
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', character: char, content: parts[0], created_at: now };
            return updated;
          });
          await saveMessage({ role: 'assistant', content: parts[0], character: char });

          for (let i = 1; i < parts.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const partNow = new Date().toISOString();
            setMessages((prev) => [...prev, { role: 'assistant', character: char, content: parts[i], created_at: partNow }]);
            await saveMessage({ role: 'assistant', content: parts[i], character: char });
          }
        }
      } catch (err) {
        console.error(err);
        raw = ERRORS[char];
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', character: char, content: raw };
          return updated;
        });
      }

      roundResponses.push({ char, content: raw });

      // 感情状態を更新して localStorage に保存
      setCharacterMood(prev => {
        const next = applyMoodUpdate(prev, char, raw);
        localStorage.setItem('mia_mood', JSON.stringify(next));
        return next;
      });

      const history: Message[] = [...currentMessages, { role: 'assistant', character: char, content: raw }];
      return { response: raw, history };
    };

    // Decide who goes first based on the last message text
    const first: 'mia' | 'mimi' = pickFirstCharacter(lastUserText);
    const second: 'mia' | 'mimi' = first === 'mia' ? 'mimi' : 'mia';

    // First character responds (no context yet)
    const { history: afterFirst } = await runCharacter(first, updatedMessages);

    // Second character responds (sees first's response via roundResponses)
    const { history: afterSecond } = await runCharacter(second, afterFirst);

    // Relay loop: allow either character to jump back in, including the same speaker twice in a row
    const MAX_TURNS = 6;
    let lastChar = second;
    let currentHistory = afterSecond;
    let turn = 2; // already did 2 turns

    while (turn < MAX_TURNS && Math.random() < 0.5) {
      const switchChance = turn >= 4 ? 0.7 : 0.55;
      const currentChar: 'mia' | 'mimi' =
        Math.random() < switchChance
          ? (lastChar === 'mia' ? 'mimi' : 'mia')
          : lastChar;

      const { history } = await runCharacter(currentChar, currentHistory);
      currentHistory = history;
      lastChar = currentChar;
      turn++;
    }

    setIsStreaming(false);
    setStreamingCharacter(null);

    // Fetch contextual suggestions based on updated conversation
    fetchSuggestions(updatedMessages);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Username modal */}
      {showUsernameModal && <UsernameModal onSave={saveUsername} />}

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm border-b border-purple-100 dark:border-gray-700 shadow-sm" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex -space-x-2">
          <div className="w-10 h-10 rounded-full overflow-hidden shadow-md border-2 border-white z-10">
            <CatAvatar variant="mia" size={40} />
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden shadow-md border-2 border-white">
            <CatAvatar variant="mimi" size={40} />
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight">Mia &amp; Mimi</h1>
          <p className="text-xs text-purple-500 dark:text-purple-300 font-medium truncate">English practice squad</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* Dark mode — always visible */}
          <button
            onClick={toggleDark}
            className="text-gray-400 hover:text-purple-500 dark:text-gray-400 dark:hover:text-yellow-400 transition-colors p-1.5"
            title={darkMode ? 'ライトモード' : 'ダークモード'}
          >
            {darkMode ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            )}
          </button>

          {/* Vocab — always visible */}
          <button
            onClick={() => setShowVocab(true)}
            className="text-purple-400 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 transition-colors p-1.5"
            title="単語帳"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"/></svg>
          </button>

          {/* Desktop-only buttons */}
          <div className="hidden sm:flex items-center gap-1">
            {username && (
              <button onClick={() => setShowUsernameModal(true)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-purple-500 transition-colors px-1">
                {username}
              </button>
            )}
            {/* Refresh menu (desktop) */}
            <div className="relative" ref={refreshMenuRef}>
              <button onClick={() => setShowRefreshMenu(v => !v)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors p-1.5" title="更新メニュー">
                <svg className={`w-4 h-4 ${loadingTrending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
              {showRefreshMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-50">
                  <button onClick={() => { fetchTrending(); setShowRefreshMenu(false); }} disabled={loadingTrending} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    情報更新
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={refreshConversation} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-pink-50 dark:hover:bg-gray-700 transition-colors">
                    <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    リフレッシュ
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setShowSync(true)} className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors p-1.5" title="デバイス同期">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1-4l-3 3m0 0l-3-3m3 3V4"/></svg>
            </button>
            <button onClick={generateProfile} disabled={generatingProfile} className={`transition-colors p-1.5 ${userProfile ? 'text-green-400 hover:text-green-600' : 'text-gray-400 hover:text-blue-500'} disabled:opacity-40`} title={userProfile ? 'プロファイル済み（再生成）' : 'プロファイル生成'}>
              {generatingProfile
                ? <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              }
            </button>
            <Link href="/translate" className="text-gray-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors p-1.5" title="翻訳">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M2 5h12"/>
                <path d="M7 2v3"/>
                <path d="M4 14c0-2 2-5 4-5s4 3 4 5"/>
                <path d="M14 18l4-8 4 8"/>
                <path d="M15.5 15.5h5"/>
              </svg>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button onClick={() => setShowMenu(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
                {username && (
                  <>
                    <button onClick={() => { setShowUsernameModal(true); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors">
                      <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                      {username}
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                  </>
                )}
                <button onClick={() => { fetchTrending(); setShowMenu(false); }} disabled={loadingTrending} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40">
                  <svg className={`w-3.5 h-3.5 text-indigo-400 ${loadingTrending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  情報更新
                </button>
                <button onClick={() => { refreshConversation(); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-pink-50 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  リフレッシュ
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700" />
                <button onClick={() => { setShowSync(true); setShowMenu(false); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1-4l-3 3m0 0l-3-3m3 3V4"/></svg>
                  デバイス同期
                </button>
                <button onClick={() => { generateProfile(); setShowMenu(false); }} disabled={generatingProfile} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40">
                  <svg className={`w-3.5 h-3.5 ${userProfile ? 'text-green-400' : 'text-blue-400'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  {userProfile ? 'プロファイル再生成' : 'プロファイル生成'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1 items-center text-purple-400">
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} message={msg} vocabOwnerId={vocabOwnerIdRef.current} />
            ))}

            {/* Thinking indicator (debounce wait — input still enabled) */}
            {isThinking && !isStreaming && (
              <div className="flex items-end gap-2 mb-4">
                <div className="flex -space-x-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-sm border-2 border-white z-10">
                    <CatAvatar variant="mia" size={32} />
                  </div>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-sm border-2 border-white">
                    <CatAvatar variant="mimi" size={32} />
                  </div>
                </div>
                <div className="rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border bg-gray-100 border-gray-200 dark:bg-gray-700 dark:border-gray-600">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {isStreaming && messages[messages.length - 1]?.content === '' && streamingCharacter && (
              <div className="flex items-end gap-2 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shadow-md">
                  <CatAvatar variant={streamingCharacter} size={40} />
                </div>
                <div className={`rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border ${
                  streamingCharacter === 'mia'
                    ? 'bg-purple-100 border-purple-200'
                    : 'bg-orange-100 border-orange-200'
                }`}>
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Vocab modal */}
      {showVocab && (
        <VocabModal vocabOwnerId={vocabOwnerIdRef.current} onClose={() => setShowVocab(false)} />
      )}

      {/* Sync modal */}
      {showSync && (
        <SyncModal
          ownerId={vocabOwnerIdRef.current}
          sessionId={sessionIdRef.current}
          onSync={handleSync}
          onReissueCode={(newId) => {
            localStorage.setItem('mia_vocab_owner_id', newId);
            vocabOwnerIdRef.current = newId;
            setShowSync(false);
          }}
          onClose={() => setShowSync(false)}
        />
      )}

      {/* Input */}
      <footer className="px-4 pb-5 pt-3 bg-white/70 dark:bg-gray-800/80 backdrop-blur-sm border-t border-purple-100 dark:border-gray-700">
        <div className="max-w-3xl mx-auto">
          {/* Suggestion chips */}
          {!isStreaming && (
            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
              {loadingSuggestions || loadingTopics ? (
                <div className="flex gap-1 items-center px-1 py-1.5">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              ) : (
                <>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="flex-shrink-0 text-xs text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-gray-600 border border-purple-200 dark:border-gray-600 rounded-full px-3 py-1.5 transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    onClick={() => fetchSuggestions(messages)}
                    className="flex-shrink-0 text-gray-400 hover:text-purple-400 dark:hover:text-purple-300 transition-colors p-1.5"
                    title="サジェストを更新"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => fetchTopics(messages)}
                    className="flex-shrink-0 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors p-1.5"
                    title="話題を変える"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M8 12h8M12 8l4 4-4 4"/>
                      <circle cx="12" cy="12" r="9"/>
                    </svg>
                  </button>
                  <Link
                    href="/game"
                    className="flex-shrink-0 text-gray-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors p-1.5"
                    title="英語クイズ"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </Link>
                  <Link
                    href="/translate"
                    className="flex-shrink-0 text-gray-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors p-1.5"
                    title="翻訳"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M2 5h12"/>
                      <path d="M7 2v3"/>
                      <path d="M4 14c0-2 2-5 4-5s4 3 4 5"/>
                      <path d="M14 18l4-8 4 8"/>
                      <path d="M15.5 15.5h5"/>
                    </svg>
                  </Link>
                </>
              )}
            </div>
          )}
          <ChatInput onSend={sendMessage} disabled={isStreaming} />
          <p className="text-center text-xs text-gray-400 mt-2">
            Press{' '}
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono text-xs">
              Enter
            </kbd>{' '}
            to send ·{' '}
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono text-xs">
              Shift+Enter
            </kbd>{' '}
            for new line
          </p>
        </div>
      </footer>
    </div>
  );
}
