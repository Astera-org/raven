import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  isDirty?: boolean;
}

export default function SlidePanel({
  isOpen,
  onClose,
  title,
  children,
  footer,
  isDirty,
}: SlidePanelProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-carbon-900/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Panel */}
        <Dialog.Content
          onInteractOutside={isDirty ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={isDirty ? (e) => e.preventDefault() : undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col bg-warm-sand-100 shadow-xl transition-transform duration-300 ease-in-out data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-carbon-100 bg-white px-6 py-5">
            <Dialog.Title className="font-serif text-headline-10 text-foreground">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close panel"
              className="flex h-8 w-8 items-center justify-center rounded text-carbon-300 transition-colors hover:bg-warm-sand-300 hover:text-foreground"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path
                  d="M3 3L13 13M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Dialog.Close>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="flex flex-col gap-5">{children}</div>
          </div>

          {/* Footer */}
          <div className="border-t border-carbon-100 bg-white px-6 py-4">
            {footer}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
