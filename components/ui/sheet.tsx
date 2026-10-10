"use client";

import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Icon } from "@/components/ui/icon";

/** Foglio dal basso su mobile, finestra centrata su desktop. */
export function Sheet({
  title,
  isOpen,
  onClose,
  children,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-40 flex items-end justify-center bg-scrim md:items-center md:p-6"
    >
      <Modal className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] border border-line bg-surface md:max-w-lg md:rounded-[22px]">
        <Dialog className="flex flex-col gap-4 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 outline-none">
          <div className="flex items-center justify-between gap-3">
            <Heading slot="title" className="label-mono">
              {title}
            </Heading>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="-mr-2.5 flex size-11 items-center justify-center rounded-xl text-text-2 hover:bg-surface-2 hover:text-text"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
