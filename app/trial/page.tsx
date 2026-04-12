'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import CatAvatar from '@/components/CatAvatar';
import { TRIAL_RECENT_MESSAGES_KEY, type TrialEvidenceItem, type TrialHistoryMessage } from '@/lib/trial';

type TrialMessage = {
  role: 'mimi' | 'mia' | 'user';
  content: string;
  id: string;
  translation?: string | null;
  isTranslating?: boolean;
};

type TrialPhase = 'loading' | 'defending' | 'verdict' | 'done';

const MAX_DEFENSE_TURNS = 3;

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export default function TrialPage() {
  const [phase, setPhase] = useState<TrialPhase>('loading');
  const [charge, setCharge] = useState('');
  const [evidence, setEvidence] = useState<TrialEvidenceItem[]>([]);
  const [messages, setMessages] = useState<TrialMessage[]>([]);
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState('');
  const [verdictOutcome, setVerdictOutcome] = useState<'guilty' | 'not_guilty' | 'dismissed' | null>(null);
  const [expGained, setExpGained] = useState(0);
  const [isMimiTyping, setIsMimiTyping] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const defenseMessagesRef = useRef<string[]>([]);
  const mimiRepliesRef = useRef<string[]>([]);
  const hasAwardedExpRef = useRef(false);

  const defenseCount = defenseMessagesRef.current.length;

  const visibleEvidence = useMemo(
    () => evidence.filter((item) => item.isRelevant),
    [evidence],
  );

  // globals.css sets overflow:hidden on body (for the chat page).
  // Override it here so the trial page can scroll normally.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev; };
  }, []);

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
      } catch {
        recentMessages = [];
      }

      try {
        const response = await fetch('/api/trial/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recentMessages, ownerID: savedOwnerId }),
        });
        const data = await response.json() as { charge: string; evidence: TrialEvidenceItem[] };
        setCharge(data.charge);
        setEvidence(data.evidence ?? []);

        const turnOne = `ok so. I'm taking you to court.\nthe charge: ${data.charge}\nthis is serious. [stamp:angry]`;
        setMessages([{ role: 'mimi', content: turnOne, id: makeId('mimi') }]);

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const judgeIntro = `...court is now in session. (｀・ω・´)\nMimi, please present your case.\n${savedUsername ?? 'you'}, you'll have a chance to respond. go ahead.`;
        setMessages((prev) => [...prev, { role: 'mia', content: judgeIntro, id: makeId('mia') }]);
        setPhase('defending');
      } catch {
        setCharge('general suspicious behavior');
        setEvidence([]);
        setMessages([
          { role: 'mimi', content: "ok so. you're in court now. I have proof.", id: makeId('mimi') },
          { role: 'mia', content: `${savedUsername ?? 'you'}, please say something in your defense.`, id: makeId('mia') },
        ]);
        setPhase('defending');
      }
    };

    void run();
  }, []);

  useEffect(() => {
    if (phase !== 'done' || hasAwardedExpRef.current || !ownerId) return;
    if (verdictOutcome === 'guilty') return; // 敗訴は EXP なし

    hasAwardedExpRef.current = true;
    void (async () => {
      try {
        await fetch('/api/game/exp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vocabOwnerId: ownerId, expGained: 20 }),
        });
        setExpGained(20);
      } catch {
        // 保存失敗しても UI は更新する
        setExpGained(20);
      }
    })();
  }, [phase, ownerId, verdictOutcome]);

  const submitVerdict = async () => {
    setPhase('verdict');
    setIsMimiTyping(false);

    try {
      const response = await fetch('/api/trial/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charge,
          evidence,
          userDefense: defenseMessagesRef.current,
          mimiReplies: mimiRepliesRef.current,
        }),
      });
      const data = await response.json() as { verdict: string; outcome: 'guilty' | 'not_guilty' | 'dismissed' };
      setVerdict(data.verdict);
      setVerdictOutcome(data.outcome);
      setMessages((prev) => [...prev, { role: 'mia', content: data.verdict, id: makeId('mia') }]);
    } catch {
      const fallback = 'case dismissed. Mimi had passion, but the evidence was a bit tragic.';
      setVerdict(fallback);
      setVerdictOutcome('dismissed');
      setMessages((prev) => [...prev, { role: 'mia', content: fallback, id: makeId('mia') }]);
    } finally {
      setPhase('done');
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || phase !== 'defending' || isMimiTyping) return;

    defenseMessagesRef.current = [...defenseMessagesRef.current, trimmed];
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, id: makeId('user') }]);
    setInput('');

    if (defenseMessagesRef.current.length >= MAX_DEFENSE_TURNS) {
      await submitVerdict();
      return;
    }

    setIsMimiTyping(true);
    try {
      const response = await fetch('/api/trial/mimi-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charge,
          evidence,
          history: messages
            .filter((message) => message.role === 'user' || message.role === 'mimi')
            .map((message) => ({
              role: message.role === 'user' ? 'user' as const : 'mimi' as const,
              content: message.content,
            })),
          userMessage: trimmed,
        }),
      });
      const data = await response.json() as { reply: string };
      mimiRepliesRef.current = [...mimiRepliesRef.current, data.reply];
      setMessages((prev) => [...prev, { role: 'mimi', content: data.reply, id: makeId('mimi') }]);
    } catch {
      const fallback = 'objection. that sounded fake and I have proof.';
      mimiRepliesRef.current = [...mimiRepliesRef.current, fallback];
      setMessages((prev) => [...prev, { role: 'mimi', content: fallback, id: makeId('mimi') }]);
    } finally {
      setIsMimiTyping(false);
    }
  };

  const toggleTranslation = async (messageId: string, content: string, character: 'mia' | 'mimi') => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        if (m.translation !== null && m.translation !== undefined) {
          return { ...m, translation: null };
        }
        return { ...m, isTranslating: true };
      }),
    );

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, character }),
      });
      const { result } = await res.json() as { result: string };
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, translation: result, isTranslating: false } : m)),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, translation: '翻訳できませんでした', isTranslating: false } : m)),
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-purple-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 text-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mock Trial</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Mimi is prosecuting. Mia is judging.</p>
          </div>
          <Link href="/" className="rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 shadow-sm transition hover:border-purple-200 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400">
            Back to chat
          </Link>
        </div>

        <div className="mb-4 rounded-2xl border border-orange-200 dark:border-orange-900 bg-white/90 dark:bg-gray-800/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500 dark:text-orange-400">Charge</p>
          <p className="mt-1 text-base font-medium">{charge || 'Preparing the most serious case imaginable...'}</p>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Evidence</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Only relevant exhibits are shown</p>
          </div>
          <div className="space-y-2">
            {(visibleEvidence.length > 0 ? visibleEvidence : evidence).map((item) => (
              <div key={item.id} className="rounded-xl border border-orange-100 dark:border-orange-900 bg-orange-50/70 dark:bg-orange-950/40 px-3 py-2">
                <p className="text-xs font-semibold text-orange-500 dark:text-orange-400">{item.label}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{item.content}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 p-4 shadow-lg backdrop-blur">
          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const isMia = message.role === 'mia';

              return (
                <div key={message.id} className={`flex items-end gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="overflow-hidden rounded-full shadow-md">
                      <CatAvatar variant={isMia ? 'mia' : 'mimi'} size={40} />
                    </div>
                  )}
                  <div className="max-w-[80%] space-y-1">
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      isUser
                        ? 'rounded-br-sm bg-indigo-600 text-white'
                        : isMia
                          ? 'rounded-bl-sm border border-purple-200 dark:border-purple-800 bg-purple-100 dark:bg-purple-950/60 text-gray-800 dark:text-gray-100'
                          : 'rounded-bl-sm border border-orange-200 dark:border-orange-800 bg-orange-100 dark:bg-orange-950/60 text-gray-800 dark:text-gray-100'
                    }`}>
                      <p className="mb-1 text-[11px] font-semibold opacity-70">{isUser ? username ?? 'You' : isMia ? 'Mia' : 'Mimi'}</p>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                    {!isUser && message.translation !== null && message.translation !== undefined && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 bg-yellow-50 dark:bg-gray-700 border border-yellow-200 dark:border-gray-600 rounded-xl px-3 py-2 leading-relaxed whitespace-pre-wrap">
                        {message.translation}
                      </div>
                    )}
                    {!isUser && (
                      <div className="flex justify-end pr-1">
                        <button
                          onClick={() => void toggleTranslation(message.id, message.content, isMia ? 'mia' : 'mimi')}
                          className={`text-xs font-bold transition-colors ${message.translation !== null && message.translation !== undefined ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`}
                          title="日本語訳を見る"
                        >
                          {message.isTranslating ? '...' : '訳'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isMimiTyping && (
              <div className="flex items-end gap-3">
                <div className="overflow-hidden rounded-full shadow-md">
                  <CatAvatar variant="mimi" size={40} />
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
          </div>

          {phase === 'defending' && (
            <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Your defense</span>
                <span>{defenseCount}/{MAX_DEFENSE_TURNS}</span>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  rows={3}
                  className="min-h-[84px] flex-1 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-3 text-sm outline-none transition focus:border-purple-300 dark:focus:border-purple-600 focus:bg-white dark:focus:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                  placeholder="Present your defense..."
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || isMimiTyping}
                  className="self-end rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className={`rounded-2xl border px-4 py-3 ${verdictOutcome === 'guilty' ? 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40' : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40'}`}>
                <p className={`text-sm font-semibold ${verdictOutcome === 'guilty' ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {verdictOutcome === 'guilty' ? 'Guilty — no EXP this time.' : 'Trial complete'}
                </p>
                <p className={`mt-1 text-sm ${verdictOutcome === 'guilty' ? 'text-rose-800 dark:text-rose-300' : 'text-emerald-800 dark:text-emerald-300'}`}>{verdict}</p>
                {verdictOutcome !== 'guilty' && (
                  <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">EXP gained: +{expGained || 20}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
