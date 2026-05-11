import type { ReactNode } from 'react';

interface HeroHeaderProps {
  children: ReactNode;
  className?: string;
}

export function HeroHeader({ children, className = '' }: HeroHeaderProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-b-4xl bg-hero-forest pb-6 ${className}`}
      style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-surface/[0.06]"
        aria-hidden="true"
      />
      <div className="relative px-5 pt-3 text-white">{children}</div>
    </div>
  );
}
