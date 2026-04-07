'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface VocabItem {
  id: string;
  phrase: string;
  translation: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function VocabModal({ sessionId, onClose }: Props) {
  const [items, setItems] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('vocabulary')
      .select('id, phrase, translation, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setItems((data as VocabItem[]) ?? []);
        setLoading(false);
      });
  }, [sessionId]);

  const deleteItem = async (id: string) => {
    await supabase.from('vocabulary').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">単語帳</h2>
            <p className="text-xs text-gray-400">{items.length}件保存済み</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📖</p>
              <p className="text-sm">まだ保存されていません</p>
              <p className="text-xs mt-1">メッセージのブックマークボタンで保存できます</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="bg-purple-50 dark:bg-gray-700 border border-purple-100 dark:border-gray-600 rounded-xl px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{item.phrase}</p>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-base leading-none mt-0.5"
                  >✕</button>
                </div>
                {item.translation && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{item.translation}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
