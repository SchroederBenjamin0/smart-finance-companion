import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-forest-950/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[28px] bg-paper shadow-nav focus:outline-none data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down"
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-forest-950/15" />
          <header className="flex items-center justify-between px-5 pt-3 pb-2">
            <Dialog.Title className="text-lg font-semibold text-ink">
              {title}
            </Dialog.Title>
            <Dialog.Close
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink shadow-card"
              aria-label="Schließen"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-3">{children}</div>
          {footer && (
            <div
              className="border-t border-forest-950/10 bg-white/95 px-5 py-3 backdrop-blur"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
