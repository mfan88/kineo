import { Toast, toast } from "@heroui/react";

/** Shows toasts at the bottom of the window. Render once, at the root. */
export function ToastHost() {
  return <Toast.Provider placement="bottom" />;
}

/**
 * Confirmation toasts ("Note saved", "Invoice sent"). With `undo`, the toast has an
 * Undo button and stays a little longer.
 */
export function notify(message: string, undo?: () => void): string {
  if (!undo) return toast.success(message);
  const id: string = toast.success(message, {
    timeout: 8000,
    actionProps: {
      children: "Undo",
      onPress: () => {
        undo();
        toast.close(id);
      },
    },
  });
  return id;
}

/** An action failed; `message` says what to do. */
export function notifyError(message: string): string {
  return toast.danger(message);
}
