'use client';

import { useState } from 'react';

interface Props {
  onSave: (name: string) => void;
}

export default function UsernameModal({ onSave }: Props) {
  const [name, setName] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl px-7 py-7 w-80 flex flex-col gap-4">
        <div className="text-center">
          <p className="text-2xl mb-1">✨</p>
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">あなたの名前は？</h2>
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">MiaとMimiがあなたの名前で呼んでくれます</p>
        </div>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Your name..."
          maxLength={20}
          autoFocus
          className="w-full border border-purple-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100 dark:bg-gray-700 outline-none focus:ring-2 focus:ring-purple-300 placeholder-gray-300"
        />
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full py-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-bold shadow disabled:opacity-40 transition-all hover:from-purple-600 hover:to-pink-600"
        >
          はじめる！
        </button>
      </div>
    </div>
  );
}
