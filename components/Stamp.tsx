'use client';

const STAMPS: Record<string, { kaomoji: string; label: string; bg: string; border: string }> = {
  wow:    { kaomoji: '(ﾟДﾟ)',     label: 'WOW',      bg: 'bg-yellow-50',  border: 'border-yellow-300' },
  lol:    { kaomoji: '(≧▽≦)',     label: 'LOL',       bg: 'bg-pink-50',    border: 'border-pink-300' },
  cry:    { kaomoji: '(；∀；)',    label: 'CRYING',    bg: 'bg-blue-50',    border: 'border-blue-300' },
  love:   { kaomoji: '(*´∀｀*)',   label: 'LOVE',      bg: 'bg-red-50',     border: 'border-red-300' },
  angry:  { kaomoji: '(°Д°)',     label: 'UGH',       bg: 'bg-orange-50',  border: 'border-orange-300' },
  cool:   { kaomoji: '(｀∀´)',     label: 'GENIUS',    bg: 'bg-purple-50',  border: 'border-purple-300' },
  no:     { kaomoji: '(╬°Д°)',    label: 'NO WAY',    bg: 'bg-red-50',     border: 'border-red-400' },
  yes:    { kaomoji: '(^▽^)',     label: 'YES!!',     bg: 'bg-green-50',   border: 'border-green-300' },
  think:  { kaomoji: '(´・ω・｀)', label: 'HMMMM',     bg: 'bg-gray-50',    border: 'border-gray-300' },
  dead:   { kaomoji: '(+_+)',     label: 'DEAD',      bg: 'bg-slate-50',   border: 'border-slate-300' },
  fire:   { kaomoji: '(ﾉ´ヮ)ﾉ',  label: 'HYPE!!',    bg: 'bg-amber-50',   border: 'border-amber-300' },
  shock:  { kaomoji: '(°o°)',     label: 'SHOCKED',   bg: 'bg-cyan-50',    border: 'border-cyan-300' },
};

export default function Stamp({ name }: { name: string }) {
  const stamp = STAMPS[name.toLowerCase()] ?? STAMPS['wow'];
  return (
    <div
      className={`inline-flex flex-col items-center justify-center w-28 h-28 rounded-2xl border-2 shadow-md select-none ${stamp.bg} ${stamp.border}`}
    >
      <span className="text-2xl leading-none mb-1">{stamp.kaomoji}</span>
      <span className="text-[11px] font-black tracking-widest text-gray-500">{stamp.label}</span>
    </div>
  );
}

export const STAMP_NAMES = Object.keys(STAMPS);
