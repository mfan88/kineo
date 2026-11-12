import { AlertDialog, Button } from "@heroui/react";
import { useState } from "react";
import { useAccount } from "../auth/account";
import { notifyError } from "./Toasts";

/** Bottom of Settings: who's signed in, and Sign out. Hidden outside a signed-in session. */
export function AccountSection() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!account) return null;
  const { email, signOut } = account;

  async function run(discardUnsynced: boolean) {
    setBusy(true);
    try {
      const result = await signOut({ discardUnsynced });
      if (result === "unsynced-changes") setConfirming(true);
    } catch {
      notifyError("Couldn't sign out. Quit Kineō, open it again and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Account" className="flex items-center justify-between gap-4 px-1">
      <p className="text-sm text-muted">{email ? `Signed in as ${email}` : "Signed in"}</p>
      <Button
        variant="secondary"
        className="h-11 px-5"
        isPending={busy}
        onPress={() => void run(false)}
      >
        Sign out
      </Button>

      <AlertDialog.Backdrop isOpen={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>Some changes haven't been saved yet</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                They're only on this computer. If you sign out now, they'll be lost. To keep them,
                stay signed in and connect to the internet until they've saved.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                variant="secondary"
                className="h-11"
                autoFocus
                onPress={() => setConfirming(false)}
              >
                Stay signed in
              </Button>
              <Button
                variant="danger"
                className="h-11"
                onPress={() => {
                  setConfirming(false);
                  void run(true);
                }}
              >
                Sign out anyway
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </section>
  );
}
