'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

// Built on the native <dialog> + showModal(), which gives a true modal for free:
// focus moves inside, everything behind becomes INERT (it can't be clicked or
// focused — Tab cycles through the dialog and the browser's own UI, never the
// page), Escape closes it, it renders in the top layer with a ::backdrop, and
// focus returns to the opening button when it closes.
export function Modal({ open, onClose, title, description, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Sync the `open` prop with the native dialog
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Fires for Escape and dialog.close(): keep React state in sync
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-navy-950/60 backdrop:backdrop-blur-sm"
    >
      {/* Only mount the content while open, so it starts fresh each time */}
      {open && (
        <div className="p-6 sm:p-7">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          )}
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
