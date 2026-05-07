import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-medium uppercase tracking-wide text-ink-subtle">
      {children}
    </h3>
  );
}

export function CardValue({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">
      {children}
    </div>
  );
}
