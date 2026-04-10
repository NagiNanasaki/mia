'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { TranslateWordResult } from '@/app/api/translate-word/route';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function WordCountBadge({ count }: { count: number }) {
  const color =
    count === 0
      ? 'text-gray-400'
      : count <= 4
        ? 'text-purple-500'
        : count <= 20
          ? 'text-orange-500'
          : 'text-red-500';
  return (
    <span className={`text-xs font-medium ${color}`}>
      {count} / 20 語
    </span>
  );
}

function SaveButton({
  state,
  onClick,
}: {
  state: SaveState;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={state === 'saving' || state === 'saved'}
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-80 ${
        state === 'saved'
          ? 'border-green-300 bg-green-50 text-green-600 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
          : state === 'error'
            ? 'border-red-200 bg-red-50 text-red-500 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
            : 'border-purple-200 bg-purple-50 text-purple-500 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
      }`}
    >
      {state === 'saving' ? '保存中...' : state === 'saved' ? '保存済み' : state === 'error' ? '失敗' : '単語帳へ'}
    </button>
  );
}

export default function TranslatePage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslateWordResult | null>(null);
  const [saveStates, setSaveStates] = useState<SaveState[]>([]);
  const [inputError, setInputError] = useState('');

  const wordCount = countWords(input);

  async function handleTranslate() {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (wordCount > 20) {
      setInputError('20語以内で入力してください');
      return;
    }

    setInputError('');
    setLoading(true);
    setResult(null);
    setSaveStates([]);

    try {
      const res = await fetch('/api/translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const data: TranslateWordResult = await res.json();
      setResult(data);
      if (data.mode === 'normal') {
        setSaveStates(new Array(data.candidates.length).fill('idle'));
      }
    } catch {
      setResult({ mode: 'error', message: '翻訳に失敗しました' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(index: number, translation: string, nuance: string) {
    const vocabOwnerId = localStorage.getItem('mia_vocab_owner_id') ?? '';
    if (!vocabOwnerId) return;

    setSaveStates((prev) => {
      const next = [...prev];
      next[index] = 'saving';
      return next;
    });

    try {
      const res = await fetch('/api/vocab-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ phrase: input.trim(), translation: `${translation}（${nuance}）` }],
          sessionId: vocabOwnerId,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveStates((prev) => {
        const next = [...prev];
        next[index] = 'saved';
        return next;
      });
    } catch {
      setSaveStates((prev) => {
        const next = [...prev];
        next[index] = 'error';
        return next;
      });
      setTimeout(() => {
        setSaveStates((prev) => {
          const next = [...prev];
          next[index] = 'idle';
          return next;
        });
      }, 2500);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !loading) handleTranslate();
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <header className="flex items-center border-b border-purple-100 bg-white/80 px-5 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/90">
        <Link href="/" className="text-purple-500 transition-colors hover:text-purple-700">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="mx-auto text-base font-bold text-gray-800 dark:text-gray-100">Translate</h1>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-6 space-y-5">
        {/* Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-600 dark:text-gray-300">英単語・フレーズ</label>
            <WordCountBadge count={wordCount} />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInputError('');
                setResult(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="例: look forward to"
              className="flex-1 rounded-2xl border border-purple-200 bg-white px-4 py-3 text-base text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-purple-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <button
              onClick={handleTranslate}
              disabled={loading || !input.trim() || wordCount > 20}
              className="rounded-2xl bg-purple-600 px-5 py-3 font-bold text-white shadow-md transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
            >
              {loading ? (
                <span className="flex items-center gap-1">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-white"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </span>
              ) : (
                '訳す'
              )}
            </button>
          </div>
          {inputError && <p className="text-xs text-red-500">{inputError}</p>}
          <p className="text-xs text-gray-400">
            {wordCount <= 4 ? '通常モード：訳候補3件' : wordCount <= 20 ? '長文モード：全文訳＋主要語句' : ''}
          </p>
        </div>

        {/* Results */}
        {result?.mode === 'normal' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">訳候補</p>
            {result.candidates.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-2xl border border-purple-100 bg-white/90 px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/90"
              >
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-800 dark:text-gray-100">{c.translation}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{c.nuance}</p>
                </div>
                <SaveButton
                  state={saveStates[i] ?? 'idle'}
                  onClick={() => handleSave(i, c.translation, c.nuance)}
                />
              </div>
            ))}
          </div>
        )}

        {result?.mode === 'long' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-orange-100 bg-white/90 px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-400">全文訳</p>
              <p className="text-base leading-relaxed text-gray-800 dark:text-gray-100">{result.fullTranslation}</p>
            </div>

            {result.keyPhrases.length > 0 && (
              <div className="rounded-2xl border border-purple-100 bg-white/90 px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-purple-400">主要語句</p>
                <div className="space-y-2">
                  {result.keyPhrases.map((kp, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{kp.original}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{kp.translation}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-400">5語以上は保存できません</p>
          </div>
        )}

        {result?.mode === 'error' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm text-red-600 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
