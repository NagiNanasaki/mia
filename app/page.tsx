'use client';

import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import ChatMessage, { Message } from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import CatAvatar from '@/components/CatAvatar';
import VocabModal from '@/components/VocabModal';
import UsernameModal from '@/components/UsernameModal';

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

// --- ミニゲーム ---
type GameState = {
  active: boolean
  type: 'lie_detection' | null
  round: number
}

const DEFAULT_GAME: GameState = { active: false, type: null, round: 0 }

const GAME_PROPOSAL_REGEX = /I dare you|find the (?:lie|wrong one)|one of (?:them|these) is (?:wrong|a lie)|3.*(?:wrong|lie)|(?:wrong|lie).*3/i
const GAME_END_REGEX = /game over|you (?:got|win|found) it|that(?:'s| is) the (?:lie|wrong one)|ok fine.{0,20}right|well played|you win/i

function buildGameContext(game: GameState): string | null {
  if (!game.active || game.type !== 'lie_detection') return null
  return `[ACTIVE GAME — Grammar Lie Detection, Round ${game.round}]
Present exactly 3 English grammar or vocabulary statements. Make one intentionally wrong (your choice). Rules:
- Keep all 3 educational and plausible — just sneak one wrong one in
- If user correctly identifies the lie: deny it first ("no that's right (｀ε´)"), then reluctantly admit it after they push back
- If user guesses wrong: full confidence they're wrong, no backing down
- After user finds the lie, or after Round 3, wrap up naturally in character`
}

function buildGameProposalHint(): string {
  return `[Optional one-time move: you've been chatting for a while. If the moment feels right, propose a quick grammar lie-detection game — tell the user you'll say 3 English facts and one is a lie, challenge them to find it. Keep it in character and casual. Don't force it if the conversation is already interesting.]`
}
// --- /ミニゲーム ---

const DEFAULT_SUGGESTIONS = [
  "What's your favourite anime right now?",
  "Teach me a cool British slang word!",
  "What's a weird fact you know?",
];

const INITIAL_MESSAGES: Message[] = [
  {
    role: 'assistant',
    character: 'mia',
    content:
      "WAIT you actually showed up (ﾟДﾟ) ok ok ok — I'm Mia, genius AI, Manchester, you're welcome for my presence. my neural nets have already clocked approximately three things wrong about you and we haven't even started yet (｀∀´) anyway — talk. what's your English like? be honest, I'll find out either way.",
  },
  {
    role: 'assistant',
    character: 'mimi',
    content:
      "oh. you're here. I'm Mimi. I already know everything about English so I'm basically your teacher now (｀ε´) also cats are technically a type of dog, don't fact-check that. anyway what do you want to talk about — and before you answer, whatever you're about to say, I've heard it before.",
  },
];

function getSessionId(): string {
  let id = localStorage.getItem('mia_session_id');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('mia_session_id', id);
  }
  return id;
}

// Build Claude API messages for a specific character
function buildApiMessages(
  history: Message[],
  character: 'mia' | 'mimi',
  contextNote?: string  // e.g. '(Mia just said: "...")' or '(Mimi just said: "...")'
) {
  const filtered = history
    .filter((m) => m.role === 'user' || m.character === character)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  if (contextNote) {
    const lastUserIdx = filtered.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx >= 0) {
      filtered[lastUserIdx] = {
        role: 'user',
        content: `${filtered[lastUserIdx].content}\n\n${contextNote}`,
      };
    }
  }

  return filtered;
}

async function streamResponse(
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  character: 'mia' | 'mimi',
  onChunk: (accumulated: string) => void,
  username?: string | null,
  trendingContext?: string | null,
  moodContext?: string | null,
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: apiMessages, character, username, localTime: new Date().toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }), trendingContext, moodContext }),
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
  const [gameState, setGameState] = useState<GameState>(DEFAULT_GAME);
  const [pendingGame, setPendingGame] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const sessionIdRef = useRef<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const refreshMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const sessionId = getSessionId();
      sessionIdRef.current = sessionId;

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

      const { data, error } = await supabase
        .from('messages')
        .select('role, content, character, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        setMessages(
          data.map((m) => ({
            ...m,
            character: (m.character as 'mia' | 'mimi') ?? 'mia',
          }))
        );
      } else {
        setMessages(INITIAL_MESSAGES);
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
    fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs.slice(-6) }),
    })
      .then(r => r.json())
      .then(({ suggestions: s }) => { if (s?.length) setSuggestions(s); })
      .finally(() => setLoadingSuggestions(false));
  };

  // Close refresh menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refreshMenuRef.current && !refreshMenuRef.current.contains(e.target as Node)) {
        setShowRefreshMenu(false);
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
    setMessages(INITIAL_MESSAGES);
    setSuggestions(DEFAULT_SUGGESTIONS);
    setCharacterMood(DEFAULT_MOOD);
    setGameState(DEFAULT_GAME);
    setPendingGame(false);
    setTurnCount(0);
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

  const fetchTopics = (msgs: Message[]) => {
    setLoadingTopics(true);
    fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs }),
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
    msgs.length === INITIAL_MESSAGES.length &&
    msgs.every((m, i) => m.content === INITIAL_MESSAGES[i].content);

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

    const userMessage: Message = {
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };
    const historyBase = isInitialMessages(messages) ? [] : messages;
    const updatedMessages = [...historyBase, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);
    setTurnCount(prev => prev + 1);

    await saveMessage({ role: 'user', content: userText });

    const ERRORS = {
      mia: "Oh no, something went a bit dodgy there! (＞＜) Could you try sending that again, mate? Cheers!",
      mimi: "omg something broke lol (｡>﹏<｡) sorry!! try again??",
    };

    // Track all AI responses in this round for context
    const roundResponses: { char: 'mia' | 'mimi'; content: string }[] = [];

    const buildContextNote = (forChar: 'mia' | 'mimi') => {
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
        const contextNote = buildContextNote(char);
        const apiMessages = buildApiMessages(updatedMessages, char, contextNote);
        const moodCtx = buildMoodContext(characterMood, char);
        const gameCtx = gameState.active
          ? buildGameContext({ ...gameState, round: gameState.round + 1 })
          : (char === 'mimi' && turnCount >= 6 && !pendingGame ? buildGameProposalHint() : null);
        const combinedContext = [moodCtx, gameCtx].filter(Boolean).join('\n\n') || null;
        raw = await streamResponse(apiMessages, char, (accumulated) => {
          // During streaming, show without [split] markers
          const preview = accumulated.replace(/\[split\]/gi, ' ').trimStart();
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', character: char, content: preview };
            return updated;
          });
        }, username, trendingContext, combinedContext);

        // Split into parts after streaming completes
        const parts = raw.split(/\[split\]/gi).map(p => p.trim()).filter(Boolean);
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

      // ゲーム状態の更新
      if (char === 'mimi') {
        if (gameState.active) {
          if (GAME_END_REGEX.test(raw)) {
            setGameState(DEFAULT_GAME);
          } else {
            setGameState(prev => ({ ...prev, round: prev.round + 1 }));
          }
        } else if (!pendingGame && GAME_PROPOSAL_REGEX.test(raw)) {
          setPendingGame(true);
        }
      }

      // 感情状態を更新して localStorage に保存
      setCharacterMood(prev => {
        const next = applyMoodUpdate(prev, char, raw);
        localStorage.setItem('mia_mood', JSON.stringify(next));
        return next;
      });

      const history: Message[] = [...currentMessages, { role: 'assistant', character: char, content: raw }];
      return { response: raw, history };
    };

    // Randomly decide who goes first (50/50)
    const first: 'mia' | 'mimi' = Math.random() < 0.5 ? 'mia' : 'mimi';
    const second: 'mia' | 'mimi' = first === 'mia' ? 'mimi' : 'mia';

    // First character responds (no context yet)
    const { history: afterFirst } = await runCharacter(first, updatedMessages);

    // Second character responds (sees first's response via roundResponses)
    const { history: afterSecond } = await runCharacter(second, afterFirst);

    // Relay loop: alternates between characters, max 6 total turns, 50% chance each extra turn
    const MAX_TURNS = 6;
    let currentChar = first;
    let currentHistory = afterSecond;
    let turn = 2; // already did 2 turns

    while (turn < MAX_TURNS && Math.random() < 0.5) {
      const { history } = await runCharacter(currentChar, currentHistory);
      currentHistory = history;
      currentChar = currentChar === 'mia' ? 'mimi' : 'mia';
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
      <header className="flex items-center gap-3 px-5 py-4 bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm border-b border-purple-100 dark:border-gray-700 shadow-sm" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex -space-x-2">
          <div className="w-11 h-11 rounded-full overflow-hidden shadow-md border-2 border-white z-10">
            <CatAvatar variant="mia" size={44} />
          </div>
          <div className="w-11 h-11 rounded-full overflow-hidden shadow-md border-2 border-white">
            <CatAvatar variant="mimi" size={44} />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-tight">Mia &amp; Mimi</h1>
          <p className="text-xs text-purple-500 dark:text-purple-300 font-medium">
            Your English practice squad ·
            <span className="text-purple-400 dark:text-purple-400"> Manchester, UK</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {username && (
            <button onClick={() => setShowUsernameModal(true)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-purple-500 transition-colors hidden sm:block">
              {username}
            </button>
          )}
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
          {/* Refresh menu */}
          <div className="relative" ref={refreshMenuRef}>
            <button
              onClick={() => setShowRefreshMenu(v => !v)}
              className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors p-1.5"
              title="更新メニュー"
            >
              <svg className={`w-4 h-4 ${loadingTrending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
            {showRefreshMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-50">
                <button
                  onClick={() => { fetchTrending(); setShowRefreshMenu(false); }}
                  disabled={loadingTrending}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                >
                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  情報更新
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700" />
                <button
                  onClick={refreshConversation}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-pink-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  リフレッシュ
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowVocab(true)}
            className="text-purple-400 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300 transition-colors p-1.5"
            title="単語帳"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"/></svg>
          </button>
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
              <ChatMessage key={idx} message={msg} sessionId={sessionIdRef.current} />
            ))}

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
        <VocabModal sessionId={sessionIdRef.current} onClose={() => setShowVocab(false)} />
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
              ) : pendingGame ? (
                // ゲーム提案チップ
                <>
                  <span className="flex-shrink-0 text-xs text-orange-500 dark:text-orange-400 font-semibold px-1">🎮 Mimiがゲームを提案中</span>
                  {["ok fine, let's do it (｀ε´)", "what are the 3 things?", "nah skip"].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (s === "nah skip") {
                          setPendingGame(false);
                          fetchSuggestions(messages);
                        } else {
                          setPendingGame(false);
                          setGameState({ active: true, type: 'lie_detection', round: 1 });
                          sendMessage(s);
                        }
                      }}
                      className={`flex-shrink-0 text-xs rounded-full px-3 py-1.5 transition-colors border ${
                        s === "nah skip"
                          ? "text-gray-500 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100"
                          : "text-orange-600 dark:text-orange-300 bg-orange-50 dark:bg-gray-700 border-orange-200 dark:border-orange-700 hover:bg-orange-100"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {gameState.active && (
                    <span className="flex-shrink-0 text-xs text-orange-400 dark:text-orange-300 font-semibold px-1 animate-pulse">
                      🎮 Round {gameState.round}
                    </span>
                  )}
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="flex-shrink-0 text-xs text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-gray-600 border border-purple-200 dark:border-gray-600 rounded-full px-3 py-1.5 transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                  {gameState.active ? (
                    <button
                      onClick={() => setGameState(DEFAULT_GAME)}
                      className="flex-shrink-0 text-xs text-gray-400 hover:text-red-400 dark:hover:text-red-300 transition-colors rounded-full px-2 py-1.5 border border-gray-200 dark:border-gray-600"
                    >
                      やめる
                    </button>
                  ) : (
                    <>
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
                    </>
                  )}
                </>
              )}
            </div>
          )}
          <ChatInput onSend={sendMessage} disabled={isStreaming || isLoading} />
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
