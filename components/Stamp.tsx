'use client';

const STAMPS: Record<string, { emoji: string; label: string; bg: string; border: string; text: string }> = {
  wow:    { emoji: '🤩', label: 'WOW',     bg: '#fefce8', border: '#fde047', text: '#92400e' },
  lol:    { emoji: '😂', label: 'LOL',     bg: '#fdf2f8', border: '#f9a8d4', text: '#9d174d' },
  cry:    { emoji: '😭', label: 'CRYING',  bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
  love:   { emoji: '🥰', label: 'LOVE',    bg: '#fff1f2', border: '#fca5a5', text: '#9f1239' },
  angry:  { emoji: '😤', label: 'UGH',     bg: '#fff7ed', border: '#fdba74', text: '#9a3412' },
  cool:   { emoji: '😎', label: 'GENIUS',  bg: '#faf5ff', border: '#c4b5fd', text: '#6b21a8' },
  no:     { emoji: '🙅', label: 'NO WAY',  bg: '#fff1f2', border: '#f87171', text: '#991b1b' },
  yes:    { emoji: '🙆', label: 'YES!!',   bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  think:  { emoji: '🤔', label: 'HMMMM',   bg: '#f9fafb', border: '#d1d5db', text: '#374151' },
  dead:   { emoji: '💀', label: 'DEAD',    bg: '#f8fafc', border: '#cbd5e1', text: '#334155' },
  fire:   { emoji: '🔥', label: 'HYPE!!',  bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  shock:  { emoji: '😱', label: 'SHOCKED', bg: '#ecfeff', border: '#67e8f9', text: '#155e75' },
};

export default function Stamp({ name }: { name: string }) {
  const stamp = STAMPS[name.toLowerCase()] ?? STAMPS['wow'];
  return (
    <span className="text-4xl select-none leading-none">{stamp.emoji}</span>
  );
}

export const STAMP_NAMES = Object.keys(STAMPS);
