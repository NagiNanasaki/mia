interface CatAvatarProps {
  variant: 'mia' | 'mimi';
  size?: number;
}

export default function CatAvatar({ variant, size = 40 }: CatAvatarProps) {
  const p = variant === 'mia'
    ? { body: '#c084fc', ears: '#9333ea', earInner: '#f0abfc', cheek: '#f9a8d4' }
    : { body: '#fb923c', ears: '#c2410c', earInner: '#fed7aa', cheek: '#fca5a5' };

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <polygon points="5,20 10,5 18,17" fill={p.ears} />
      <polygon points="22,17 30,5 35,20" fill={p.ears} />
      <polygon points="7,18 10,8 17,17" fill={p.earInner} />
      <polygon points="23,17 30,8 33,18" fill={p.earInner} />
      {/* Head */}
      <circle cx="20" cy="24" r="15" fill={p.body} />
      {/* Eyes */}
      <ellipse cx="14.5" cy="22" rx="2.8" ry="3.2" fill="#1e1b4b" />
      <ellipse cx="25.5" cy="22" rx="2.8" ry="3.2" fill="#1e1b4b" />
      <circle cx="15.5" cy="20.8" r="1" fill="white" />
      <circle cx="26.5" cy="20.8" r="1" fill="white" />
      {/* Nose */}
      <ellipse cx="20" cy="27.5" rx="2" ry="1.4" fill="#ec4899" />
      {/* Mouth */}
      <path d="M17 29.5 Q20 33 23 29.5" stroke="#1e1b4b" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {/* Cheeks */}
      <ellipse cx="11" cy="27" rx="3.5" ry="2" fill={p.cheek} opacity="0.55" />
      <ellipse cx="29" cy="27" rx="3.5" ry="2" fill={p.cheek} opacity="0.55" />
      {/* Whiskers */}
      <line x1="2" y1="26" x2="13" y2="27.5" stroke="#1e1b4b" strokeWidth="0.9" opacity="0.45" strokeLinecap="round" />
      <line x1="2" y1="29.5" x2="13" y2="29" stroke="#1e1b4b" strokeWidth="0.9" opacity="0.45" strokeLinecap="round" />
      <line x1="27" y1="27.5" x2="38" y2="26" stroke="#1e1b4b" strokeWidth="0.9" opacity="0.45" strokeLinecap="round" />
      <line x1="27" y1="29" x2="38" y2="29.5" stroke="#1e1b4b" strokeWidth="0.9" opacity="0.45" strokeLinecap="round" />
    </svg>
  );
}
