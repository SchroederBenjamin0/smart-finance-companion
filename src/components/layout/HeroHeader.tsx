import type { ReactNode } from 'react';

interface HeroHeaderProps {
  children: ReactNode;
  className?: string;
}

export function HeroHeader({ children, className = '' }: HeroHeaderProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-b-hero bg-hero pb-6 ${className}`}
      style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
    >
      <div className="relative px-5 pt-3 text-white">{children}</div>
    </div>
  );
}
