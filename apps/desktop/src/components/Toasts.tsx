import { Toast, toast } from "@heroui/react";

/** Shows toasts at the bottom of the window. Render once, at the root. */
export function ToastHost() {
  return <Toast.Provider placement="bottom" />;
}

/**
 * Confirmation toasts ("Note saved", "Invoice sent"). With `undo`, the toast has an
 * Undo button and stays until it's used or closed (design brief), since it may be the
 * only way back. Toasts are inverse (dark on a light page), set in @kineo/tokens.
 */
export function notify(message: string, undo?: () => void): string {
  if (!undo) return toast.success(message);
  const id: string = toast.success(message, {
    timeout: 0,
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
