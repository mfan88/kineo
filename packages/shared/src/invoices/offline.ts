/**
 * The words for a draft invoice that hasn't reached the server yet. Until it has,
 * the server may still give it a different number (another device used it), so
 * the number isn't shown and the invoice can't be sent. `device` is "phone" or "computer".
 */
export function notYetOnServerCopy(device: "phone" | "computer"): {
  title: string;
  status: string;
  numberLabel: string;
  numberValue: string;
  explanation: string;
} {
  return {
    title: "New invoice",
    status: `Offline · saved on this ${device}`,
    numberLabel: "Number",
    numberValue: "Given when you're online",
    explanation: `Waiting to reach the server before you can send. Your invoice is safe on this ${device}.`,
  };
}
