'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import CatAvatar from '@/components/CatAvatar';
import { TRIAL_RECENT_MESSAGES_KEY, type TrialEvidenceItem, type TrialHistoryMessage } from '@/lib/trial';

type Speaker = 'mia' | 'mimi' | 'user' | 'judge';

type TrialMessage = {
  role: Speaker;
  content: string;
  id: string;
  translation?: string | null;
  isTranslating?: boolean;
};

type TrialPhase = 'loading' | 'defending' | 'verdict' | 'done';

const MAX_DEFENSE_TURNS = 3;

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
  const [evidence, setEvidence] = useState<TrialEvidenceItem[]>([]);
  const [messages, setMessages] = useState<TrialMessage[]>([]);
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState('');
  const [verdictOutcome, setVerdictOutcome] = useState<'guilty' | 'not_guilty' | 'dismissed' | null>(null);
  const [expGained, setExpGained] = useState(0);
  const [isMiaProsecuting, setIsMiaProsecuting] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const defenseMessagesRef = useRef<string[]>([]);
  const miaRepliesRef = useRef<string[]>([]);
  const hasAwardedExpRef = useRef(false);

  const defenseCount = defenseMessagesRef.current.length;

  const visibleEvidence = useMemo(
    () => evidence.filter((item) => item.isRelevant),
    [evidence],
  );

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

        // Mia opens as prosecutor
        const miaOpening = `court is now in session. (｀・ω・´)\nMimi, you stand accused of: ${data.charge}\nthe prosecution is ready.`;
        setMessages([{ role: 'mia', content: miaOpening, id: makeId('mia') }]);

        await new Promise((resolve) => setTimeout(resolve, 1200));

        // Mimi reacts from the defendant stand
        setMessages((prev) => [...prev, { role: 'mimi', content: pickMimiReaction(), id: makeId('mimi') }]);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Mia invites defense
        const miaInvite = `${savedUsername ?? 'counselor'}, you have ${MAX_DEFENSE_TURNS} turns to defend your client. make them count.`;
        setMessages((prev) => [...prev, { role: 'mia', content: miaInvite, id: makeId('mia') }]);
        setPhase('defending');
      } catch {
        setCharge('general suspicious behavior');
        setEvidence([]);
        setMessages([
          { role: 'mia', content: "court is in session. Mimi stands accused of general suspicious behavior.", id: makeId('mia') },
          { role: 'mimi', content: "I didn't do anything. I want a better lawyer.", id: makeId('mimi') },
          { role: 'mia', content: `${savedUsername ?? 'counselor'}, please present your defense.`, id: makeId('mia') },
        ]);
        setPhase('defending');
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
        setExpGained(20);
      } catch {
        setExpGained(20);
      }
    })();
  }, [phase, ownerId, verdictOutcome]);

  const submitVerdict = async () => {
    setPhase('verdict');
    setIsMiaProsecuting(false);

    try {
      const response = await fetch('/api/trial/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charge,
          evidence,
          userDefense: defenseMessagesRef.current,
          miaReplies: miaRepliesRef.current,
        }),
      });
      const data = await response.json() as { verdict: string; outcome: 'guilty' | 'not_guilty' | 'dismissed' };
      setVerdict(data.verdict);
      setVerdictOutcome(data.outcome);
      setMessages((prev) => [...prev, { role: 'judge', content: data.verdict, id: makeId('judge') }]);
    } catch {
      const fallback = 'case dismissed. The prosecution made its case. The defense made their case. The court has seen enough.';
      setVerdict(fallback);
      setVerdictOutcome('dismissed');
      setMessages((prev) => [...prev, { role: 'judge', content: fallback, id: makeId('judge') }]);
    } finally {
      setPhase('done');
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || phase !== 'defending' || isMiaProsecuting) return;

    defenseMessagesRef.current = [...defenseMessagesRef.current, trimmed];
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, id: makeId('user') }]);
    setInput('');

    if (defenseMessagesRef.current.length >= MAX_DEFENSE_TURNS) {
      await submitVerdict();
      return;
    }

    setIsMiaProsecuting(true);
    try {
      const response = await fetch('/api/trial/mimi-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charge,
          evidence,
          history: messages
            .filter((m) => m.role === 'user' || m.role === 'mia')
            .map((m) => ({ role: m.role === 'user' ? 'user' as const : 'mia' as const, content: m.content })),
          userMessage: trimmed,
        }),
      });
      const data = await response.json() as { reply: string };
      miaRepliesRef.current = [...miaRepliesRef.current, data.reply];
      setMessages((prev) => [...prev, { role: 'mia', content: data.reply, id: makeId('mia') }]);
    } catch {
      const fallback = 'objection. the defense is grasping at straws and we all know it.';
      miaRepliesRef.current = [...miaRepliesRef.current, fallback];
      setMessages((prev) => [...prev, { role: 'mia', content: fallback, id: makeId('mia') }]);
    } finally {
      setIsMiaProsecuting(false);
    }
  };

  const toggleTranslation = async (messageId: string, content: string, character: 'mia' | 'mimi') => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        if (m.translation !== null && m.translation !== undefined) return { ...m, translation: null };
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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-purple-50 to-indigo-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 text-gray-900 dark:text-gray-100">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mock Trial</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Mia is prosecuting. You are defending Mimi.</p>
          </div>
          <Link href="/" className="rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 shadow-sm transition hover:border-purple-200 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400">
            Back to chat
          </Link>
        </div>

        {/* Charge */}
        <div className="mb-4 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-white/90 dark:bg-gray-800/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">Charge against Mimi</p>
          <p className="mt-1 text-base font-medium">{charge || 'Preparing the indictment...'}</p>
        </div>

        {/* Evidence */}
        <div className="mb-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Evidence</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Only relevant exhibits shown</p>
          </div>
          <div className="space-y-2">
            {(visibleEvidence.length > 0 ? visibleEvidence : evidence).map((item) => (
              <div key={item.id} className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-2">
                <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400">{item.label}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{item.content}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="rounded-3xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 p-4 shadow-lg backdrop-blur">
          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const isJudge = message.role === 'judge';
              const isMia = message.role === 'mia';

              if (isJudge) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className="w-full max-w-[90%] rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/60 px-5 py-4 text-center shadow-sm">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">⚖️ The Honourable Judge</p>
                      <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className={`flex items-end gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="overflow-hidden rounded-full shadow-md flex-shrink-0">
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
                      <p className="mb-1 text-[11px] font-semibold opacity-70">
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

            {isMiaProsecuting && (
              <div className="flex items-end gap-3">
                <div className="overflow-hidden rounded-full shadow-md">
                  <CatAvatar variant="mia" size={40} />
                </div>
                <div className="rounded-2xl rounded-bl-sm border border-purple-200 dark:border-purple-800 bg-purple-100 dark:bg-purple-950/60 px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-purple-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {phase === 'defending' && (
            <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Your defense argument</span>
                <span>{defenseCount}/{MAX_DEFENSE_TURNS}</span>
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
                  rows={3}
                  className="min-h-[84px] flex-1 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-3 text-sm outline-none transition focus:border-indigo-300 dark:focus:border-indigo-600 focus:bg-white dark:focus:bg-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                  placeholder="Defend Mimi in English..."
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || isMiaProsecuting}
                  className="self-end rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Submit
                </button>
              </div>
            </div>
          )}

          {phase === 'verdict' && (
            <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
              <span className="animate-spin">⚖️</span>
              <span>The Judge is deliberating...</span>
            </div>
          )}

          {phase === 'done' && (
            <div className="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4">
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
