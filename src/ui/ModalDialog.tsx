import { useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

type ModalDialogProps = Omit<ComponentPropsWithoutRef<"dialog">, "onClose"> & {
  onRequestClose: () => void;
};

export function ModalDialog({
  className,
  onCancel,
  onClick,
  onRequestClose,
  ...props
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    dialog.showModal();

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      {...props}
      className={className ? `modal-dialog ${className}` : "modal-dialog"}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.(event);
        onRequestClose();
      }}
      onClick={(event) => {
        onClick?.(event);

        if (event.target === event.currentTarget && !event.defaultPrevented) {
          onRequestClose();
        }
      }}
    />
  );
}
