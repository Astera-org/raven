import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** A line under the title saying what the dialog does. */
  description?: ReactNode;
  children: ReactNode;
  /** The footer bar, e.g. Cancel and the main action. */
  footer?: ReactNode;
  /** Keeps the dialog open on an outside click or Escape, so edits aren't lost. */
  isDirty?: boolean;
  /** Overrides for the card, e.g. `max-w-2xl`. */
  className?: string;
  /**
   * Runs as the dialog closes, before focus returns. Call
   * `event.preventDefault()` and focus another element when the dialog wasn't
   * opened from a Radix trigger, which is where focus otherwise goes.
   */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * A centred dialog with a white title bar, a warm sand body and an optional
 * white footer bar, like `SlidePanel`. Adapted from thestacks.org's
 * `stacks-ui/Dialog` (its framed layout), using admin-ui's palette and the
 * backdrop `SlidePanel` uses.
 */
export default function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  isDirty,
  className,
  onCloseAutoFocus,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* The overlay is the scroll container, so a card taller than the
            viewport scrolls as a whole (Radix's scrollable overlay pattern). */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-carbon-900/30 p-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <DialogPrimitive.Content
            // Radix warns when a dialog has no description; opt out explicitly.
            {...(description ? {} : { "aria-describedby": undefined })}
            onInteractOutside={isDirty ? (e) => e.preventDefault() : undefined}
            onEscapeKeyDown={isDirty ? (e) => e.preventDefault() : undefined}
            onCloseAutoFocus={onCloseAutoFocus}
            className={cn(
              "relative my-8 w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl",
              className
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-carbon-100 px-6 py-5">
              <div>
                <DialogPrimitive.Title className="text-carbon-800 font-serif text-headline-10">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="text-body-20 mt-1 font-serif text-carbon-400">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                aria-label="Close dialog"
                className="flex size-8 shrink-0 items-center justify-center rounded text-carbon-300 transition-colors hover:bg-gray-200 hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>

            <div className="flex flex-col gap-5 bg-warm-sand-100 px-6 py-6">
              {children}
            </div>

            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-carbon-100 px-6 py-4">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
