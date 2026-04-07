interface CatAvatarProps {
  variant: 'mia' | 'mimi';
  size?: number;
}

export default function CatAvatar({ variant, size = 40 }: CatAvatarProps) {
  const src = variant === 'mia' ? '/avatar-mia.jpg' : '/avatar-mimi.jpg';
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={variant} width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} />;
}
