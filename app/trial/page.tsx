'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import CatAvatar from '@/components/CatAvatar';
import VocabSelectModal, { type VocabCandidate } from '@/components/VocabSelectModal';
import { TRIAL_RECENT_MESSAGES_KEY, type TrialHistoryMessage } from '@/lib/trial';

type Speaker = 'mia' | 'mimi' | 'user' | 'judge';

type TrialMessage = {
  role: Speaker;
  content: string;
  id: string;
  translation?: string | null;
  isTranslating?: boolean;
  saveState?: 'idle' | 'extracting' | 'selecting' | 'saving' | 'saved';
  vocabCandidates?: VocabCandidate[];
};

type TrialPhase = 'loading' | 'examining' | 'verdict' | 'done';

const MAX_QUESTIONS = 6;

const MIMI_OPENING_REACTIONS = [
  "wait WHAT. I literally didn't do anything. this is a setup.",
  "...I am innocent. I have never done anything wrong in my entire life.",
  "nuh uh. not my fault. I wasn't even there.",
  "I knew this would happen. I KNEW IT. I want a different lawyer.",
  "excuse me?? I am a good person. I am literally always right about everything.",
];

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function pickMimiReaction(): string {
  return MIMI_OPENING_REACTIONS[Math.floor(Math.random() * MIMI_OPENING_REACTIONS.length)];
}

export default function TrialPage() {
  const [phase, setPhase] = useState<TrialPhase>('loading');
  const [charge, setCharge] = useState('');
  const [messages, setMessages] = useState<TrialMessage[]>([]);
  const [input, setInput] = useState('');
  const [verdictOutcome, setVerdictOutcome] = useState<'guilty' | 'not_guilty' | 'dismissed' | null>(null);
  const [expGained, setExpGained] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [selectingMessageId, setSelectingMessageId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  const userQuestionsRef = useRef<string[]>([]);
  const mimiAnswersRef = useRef<string[]>([]);
  const miaReactionsRef = useRef<string[]>([]);
  const hasAwardedExpRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const questionCount = userQuestionsRef.current.length;

  // Sync dark mode from localStorage
  useEffect(() => {
    const savedDark = localStorage.getItem('mia_dark') === '1';
    setDarkMode(savedDark);
  }, []);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('mia_dark', next ? '1' : '0');
    document.documentElement.classList.toggle('dark', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next ? '#111827' : '#ffffff');
    document.documentElement.style.backgroundColor = next ? '#111827' : '';
  };

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    const run = async () => {
      const savedOwnerId = localStorage.getItem('mia_vocab_owner_id');
      const savedUsername = localStorage.getItem('mia_username');
      setOwnerId(savedOwnerId);
      setUsername(savedUsername);

      let recentMessages: TrialHistoryMessage[] = [];
      try {
        const raw = sessionStorage.getItem(TRIAL_RECENT_MESSAGES_KEY);
        recentMessages = raw ? JSON.parse(raw) as TrialHistoryMessage[] : [];
      } catch { recentMessages = []; }

      try {
        const response = await fetch('/api/trial/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recentMessages }),
        });
        const data = await response.json() as { charge: string };
        setCharge(data.charge);

        const miaOpening = `court is now in session. (｀・ω・´)\nMimi stands accused of: ${data.charge}\nthe prosecution is ready.`;
        setMessages([{ role: 'mia', content: miaOpening, id: makeId('mia') }]);
        await new Promise((r) => setTimeout(r, 1200));

        setMessages((prev) => [...prev, { role: 'mimi', content: pickMimiReaction(), id: makeId('mimi') }]);
        await new Promise((r) => setTimeout(r, 1000));

        const miaInvite = `${savedUsername ?? 'counselor'}, you may begin your examination. question the defendant — up to ${MAX_QUESTIONS} questions.`;
        setMessages((prev) => [...prev, { role: 'mia', content: miaInvite, id: makeId('mia') }]);
        setPhase('examining');
      } catch {
        setCharge('general suspicious behavior');
        setMessages([
          { role: 'mia', content: 'court is in session. Mimi stands accused of general suspicious behavior.', id: makeId('mia') },
          { role: 'mimi', content: "I didn't do anything. I want a better lawyer.", id: makeId('mimi') },
          { role: 'mia', content: `${savedUsername ?? 'counselor'}, you may begin questioning the defendant.`, id: makeId('mia') },
        ]);
        setPhase('examining');
      }
    };
    void run();
  }, []);

  useEffect(() => {
    if (phase !== 'done' || hasAwardedExpRef.current || !ownerId) return;
    if (verdictOutcome === 'guilty') return;
    hasAwardedExpRef.current = true;
    void (async () => {
      try {
        await fetch('/api/game/exp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vocabOwnerId: ownerId, expGained: 20 }),
        });
      } catch { /* ignore */ }
      setExpGained(20);
    })();
  }, [phase, ownerId, verdictOutcome]);

  const submitVerdict = async () => {
    setPhase('verdict');
    setIsProcessing(false);
    try {
      const response = await fetch('/api/trial/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charge,
          userQuestions: userQuestionsRef.current,
          mimiAnswers: mimiAnswersRef.current,
          miaReactions: miaReactionsRef.current,
        }),
      });
      const data = await response.json() as { verdict: string; outcome: 'guilty' | 'not_guilty' | 'dismissed' };
      setVerdictOutcome(data.outcome);
      setMessages((prev) => [...prev, { role: 'judge', content: data.verdict, id: makeId('judge') }]);
    } catch {
      const fallback = 'case dismissed. The testimony was chaotic. The court needs a break.';
      setVerdictOutcome('dismissed');
      setMessages((prev) => [...prev, { role: 'judge', content: fallback, id: makeId('judge') }]);
    } finally {
      setPhase('done');
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || phase !== 'examining' || isProcessing) return;

    userQuestionsRef.current = [...userQuestionsRef.current, trimmed];
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, id: makeId('user') }]);
    setInput('');
    setIsProcessing(true);

    try {
      // Step 1: Mimi answers
      const answerRes = await fetch('/api/trial/mimi-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charge,
          history: userQuestionsRef.current.slice(0, -1).flatMap((q, i) => [
            { role: 'user' as const, content: q },
            ...(mimiAnswersRef.current[i] ? [{ role: 'mimi' as const, content: mimiAnswersRef.current[i] }] : []),
          ]),
          userQuestion: trimmed,
        }),
      });
      const { answer } = await answerRes.json() as { answer: string };
      mimiAnswersRef.current = [...mimiAnswersRef.current, answer];
      setMessages((prev) => [...prev, { role: 'mimi', content: answer, id: makeId('mimi') }]);

      // Step 2: Mia reacts to Mimi's answer
      const replyRes = await fetch('/api/trial/mimi-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charge,
          history: userQuestionsRef.current.flatMap((q, i) => [
            { role: 'user' as const, content: q },
            ...(mimiAnswersRef.current[i] ? [{ role: 'mimi' as const, content: mimiAnswersRef.current[i] }] : []),
          ]),
          mimiAnswer: answer,
        }),
      });
      const { reply } = await replyRes.json() as { reply: string };
      miaReactionsRef.current = [...miaReactionsRef.current, reply];
      setMessages((prev) => [...prev, { role: 'mia', content: reply, id: makeId('mia') }]);
    } catch {
      const fallbackAnswer = "I... was just standing there. I didn't do anything.";
      mimiAnswersRef.current = [...mimiAnswersRef.current, fallbackAnswer];
      setMessages((prev) => [...prev, { role: 'mimi', content: fallbackAnswer, id: makeId('mimi') }]);
    } finally {
      setIsProcessing(false);
    }

    if (userQuestionsRef.current.length >= MAX_QUESTIONS) {
      await submitVerdict();
    }
  };

  const toggleTranslation = async (messageId: string, content: string, character: 'mia' | 'mimi' | 'judge') => {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      if (m.translation !== null && m.translation !== undefined) return { ...m, translation: null };
      return { ...m, isTranslating: true };
    }));
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, character: character === 'judge' ? 'mia' : character }),
      });
      const { result } = await res.json() as { result: string };
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, translation: result, isTranslating: false } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, translation: '翻訳できませんでした', isTranslating: false } : m));
    }
  };

  const handleVocabExtract = async (messageId: string, content: string) => {
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, saveState: 'extracting' } : m));
    try {
      const res = await fetch('/api/vocab-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });
      const data = await res.json() as { items?: VocabCandidate[] };
      const candidates = data.items ?? [];
      if (candidates.length === 0) {
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, saveState: 'idle' } : m));
        return;
      }
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, saveState: 'selecting', vocabCandidates: candidates } : m));
      setSelectingMessageId(messageId);
    } catch {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, saveState: 'idle' } : m));
    }
  };

  const handleVocabSave = async (selected: VocabCandidate[]) => {
    const targetId = selectingMessageId;
    if (!targetId || !ownerId) return;
    setSelectingMessageId(null);
    setMessages((prev) => prev.map((m) => m.id === targetId ? { ...m, saveState: 'saving' } : m));
    if (selected.length === 0) {
      setMessages((prev) => prev.map((m) => m.id === targetId ? { ...m, saveState: 'idle' } : m));
      return;
    }
    try {
      await fetch('/api/vocab-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected, sessionId: ownerId }),
      });
      setMessages((prev) => prev.map((m) => m.id === targetId ? { ...m, saveState: 'saved' } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === targetId ? { ...m, saveState: 'idle' } : m));
    }
  };

  const activeVocabMessage = selectingMessageId ? messages.find((m) => m.id === selectingMessageId) : null;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-100 via-purple-50 to-indigo-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100 overflow-hidden">
      {activeVocabMessage && (
        <VocabSelectModal
          items={activeVocabMessage.vocabCandidates ?? []}
          onSave={(selected) => void handleVocabSave(selected)}
          onClose={() => {
            setSelectingMessageId(null);
            setMessages((prev) => prev.map((m) => m.id === activeVocabMessage.id ? { ...m, saveState: 'idle' } : m));
          }}
        />
      )}

      <div
        className="mx-auto w-full max-w-3xl flex flex-col flex-1 min-h-0 px-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="mb-2 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold leading-tight">Mock Trial</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Question Mimi · Mia prosecutes · The Judge decides.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="text-gray-400 hover:text-purple-500 dark:text-gray-400 dark:hover:text-yellow-400 transition-colors p-1.5"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              )}
            </button>
            <Link href="/" className="rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 shadow-sm transition hover:border-purple-200 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400">
              Back
            </Link>
          </div>
        </div>

        {/* Charge */}
        <div className="mb-2 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white/90 dark:bg-gray-800/90 px-3 py-2 shadow-sm flex-shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">Charge against Mimi</p>
          <p className="text-sm font-medium leading-snug mt-0.5">{charge || 'Preparing the indictment...'}</p>
        </div>

        {/* Chat card — fills all remaining vertical space */}
        <div className="flex flex-col flex-1 min-h-0 rounded-3xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 shadow-lg backdrop-blur overflow-hidden">

          {/* Scrollable messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const isJudge = message.role === 'judge';
              const isMia = message.role === 'mia';

              if (isJudge) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className="w-full max-w-[90%] rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/60 px-4 py-3 text-center shadow-sm">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">⚖️ The Honourable Judge</p>
                      <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{message.content}</p>
                      {message.translation !== null && message.translation !== undefined && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 bg-yellow-50 dark:bg-gray-700 border border-yellow-200 dark:border-gray-600 rounded-xl px-3 py-2 leading-relaxed text-left whitespace-pre-wrap">
                          {message.translation}
                        </div>
                      )}
                      <div className="mt-2 flex justify-center">
                        <button
                          onClick={() => void toggleTranslation(message.id, message.content, 'judge')}
                          className={`text-xs font-bold transition-colors ${message.translation != null ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`}
                          title="日本語訳"
                        >
                          {message.isTranslating ? '...' : '訳'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="overflow-hidden rounded-full shadow-md flex-shrink-0">
                      <CatAvatar variant={isMia ? 'mia' : 'mimi'} size={36} />
                    </div>
                  )}
                  <div className="max-w-[80%] space-y-1">
                    <div className={`rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-sm ${
                      isUser
                        ? 'rounded-br-sm bg-indigo-600 text-white'
                        : isMia
                          ? 'rounded-bl-sm border border-purple-200 dark:border-purple-800 bg-purple-100 dark:bg-purple-950/60 text-gray-800 dark:text-gray-100'
                          : 'rounded-bl-sm border border-orange-200 dark:border-orange-800 bg-orange-100 dark:bg-orange-950/60 text-gray-800 dark:text-gray-100'
                    }`}>
                      <p className="mb-1 text-[10px] font-semibold opacity-70">
                        {isUser ? (username ?? 'You') + ' (Defense)' : isMia ? 'Mia (Prosecution)' : 'Mimi (Defendant)'}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                    {!isUser && message.translation !== null && message.translation !== undefined && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 bg-yellow-50 dark:bg-gray-700 border border-yellow-200 dark:border-gray-600 rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap">
                        {message.translation}
                      </div>
                    )}
                    {!isUser && (
                      <div className="flex items-center justify-end gap-3 pr-1">
                        <button
                          onClick={() => void toggleTranslation(message.id, message.content, isMia ? 'mia' : 'mimi')}
                          className={`text-xs font-bold transition-colors ${message.translation != null ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`}
                          title="日本語訳"
                        >
                          {message.isTranslating ? '...' : '訳'}
                        </button>
                        <button
                          onClick={() => { if (!message.saveState || message.saveState === 'idle') void handleVocabExtract(message.id, message.content); }}
                          disabled={message.saveState === 'extracting' || message.saveState === 'saving'}
                          className={`transition-colors ${
                            message.saveState === 'saved' ? 'text-emerald-500' :
                            message.saveState === 'extracting' || message.saveState === 'saving' ? 'text-gray-300 cursor-not-allowed' :
                            'text-gray-400 hover:text-indigo-500'
                          }`}
                          title="単語を登録"
                        >
                          {message.saveState === 'extracting' || message.saveState === 'saving' ? (
                            <svg className="w-3.5 h-3.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg>
                          ) : message.saveState === 'saved' ? (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z"/></svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isProcessing && (
              <div className="flex items-end gap-2">
                <div className="overflow-hidden rounded-full shadow-md">
                  <CatAvatar variant="mimi" size={36} />
                </div>
                <div className="rounded-2xl rounded-bl-sm border border-orange-200 dark:border-orange-800 bg-orange-100 dark:bg-orange-950/60 px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-orange-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-orange-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-orange-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area — pinned to bottom */}
          {phase === 'examining' && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-700 p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Question Mimi</span>
                <span>{questionCount}/{MAX_QUESTIONS}</span>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={2}
                  style={{ fontSize: '16px' }}
                  className="flex-1 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-2.5 outline-none transition focus:border-indigo-300 dark:focus:border-indigo-600 focus:bg-white dark:focus:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400 resize-none"
                  placeholder="Ask Mimi a question..."
                />
                <div className="flex flex-col gap-2 self-end">
                  <button
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || isProcessing}
                    className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                    title="質問する"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  </button>
                  <button
                    onClick={() => void submitVerdict()}
                    disabled={questionCount === 0 || isProcessing}
                    className="rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title="尋問を終了して判決へ"
                  >
                    END
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'verdict' && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-700 p-3 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
              <span className="animate-spin inline-block">⚖️</span>
              <span>The Judge is deliberating...</span>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-700 p-3">
              <div className={`rounded-2xl border px-4 py-3 ${verdictOutcome === 'guilty' ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40' : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40'}`}>
                <p className={`text-sm font-semibold ${verdictOutcome === 'guilty' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {verdictOutcome === 'guilty' ? 'Guilty — Mimi takes the L. No EXP.' : 'Mimi walks free!'}
                </p>
                {verdictOutcome !== 'guilty' && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">EXP gained: +{expGained || 20}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
