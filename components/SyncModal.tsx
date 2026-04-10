'use client';

import { useState } from 'react';

interface Props {
  ownerId: string;
  onSync: (code: string) => void;
  onClose: () => void;
}

export default function SyncModal({ ownerId, onSync, onClose }: Props) {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const copy = async () => {
    await navigator.clipboard.writeText(ownerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apply = () => {
    const code = input.trim();
    if (!code.match(/^[0-9a-f-]{36}$/i)) {
      setError('正しい同期コードを入力してください');
      return;
    }
    onSync(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">デバイス同期</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>

        {/* Step 1: このデバイスのコードを共有 */}
        <div>
          <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide mb-2">このデバイスのコード</p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 break-all select-all">
              {ownerId}
            </code>
            <button
              onClick={copy}
              className="shrink-0 text-sm px-3 py-2 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/60 transition-colors font-medium"
            >
              {copied ? '✓' : 'コピー'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">別デバイスでこのコードを入力すると会話・単語帳が引き継がれます</p>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />

        {/* Step 2: 別デバイスのコードを入力 */}
        <div>
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-2">別デバイスのコードを入力</p>
          <textarea
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); }}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            rows={2}
            className="w-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          <button
            onClick={apply}
            disabled={!input.trim()}
            className="mt-2 w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            このデバイスに同期する
          </button>
          <p className="text-xs text-gray-400 mt-1.5">⚠ 現在の会話・単語帳は上書きされます</p>
        </div>
      </div>
    </div>
  );
}
