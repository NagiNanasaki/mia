'use client';

import { useState } from 'react';

export interface VocabCandidate {
  phrase: string;
  translation: string;
}

interface Props {
  items: VocabCandidate[];
  onSave: (selected: VocabCandidate[]) => void;
  onClose: () => void;
}

export default function VocabSelectModal({ items, onSave, onClose }: Props) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => true));

  const toggle = (i: number) =>
    setChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)));

  const toggleAll = () => {
    const allOn = checked.every(Boolean);
    setChecked(items.map(() => !allOn));
  };

  const selectedCount = checked.filter(Boolean).length;

  const handleSave = () => {
    onSave(items.filter((_, i) => checked[i]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">単語を選んで保存</h2>
            <p className="text-xs text-gray-400">{selectedCount}/{items.length}件選択中</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAll}
              className="text-xs text-purple-500 hover:text-purple-700 dark:text-purple-400"
            >
              {checked.every(Boolean) ? '全解除' : '全選択'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">🤔</p>
              <p className="text-sm">保存できる表現が見つかりませんでした</p>
            </div>
          ) : (
            items.map((item, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                  checked[i]
                    ? 'bg-purple-50 border-purple-300 dark:bg-purple-900/30 dark:border-purple-600'
                    : 'bg-gray-50 border-gray-200 dark:bg-gray-700/50 dark:border-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={() => toggle(i)}
                  className="mt-0.5 accent-purple-500 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{item.phrase}</p>
                  {item.translation && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{item.translation}</p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handleSave}
              disabled={selectedCount === 0}
              className="w-full py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm font-semibold transition-colors"
            >
              {selectedCount > 0 ? `${selectedCount}件を単語帳に保存` : '選択してください'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
