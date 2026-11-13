import { profileWithSignUpName } from "@kineo/shared";
import { useEffect, useSyncExternalStore } from "react";
import { userMessage } from "../components/userMessage";
import { notifyError } from "../components/Toasts";
import { useStore } from "../data/PracticeStoreProvider";
import { takeSignUpName } from "./signUpName";

/**
 * After creating an account on this computer: once the practice has been read, the
 * full name given at sign-up becomes Your profile's full name (only if it's still
 * empty). Renders nothing.
 */
export function SignUpProfileName() {
  const store = useStore();
  const data = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => {
    if (!data) return;
    const name = takeSignUpName();
    if (name === null) return;
    const fields = profileWithSignUpName(data.profile, name);
    if (!fields) return;
    store.saveProfile(fields).catch((caught: unknown) => {
      notifyError(
        userMessage(caught) ?? "Your name couldn't be saved. Add it in Settings, Your profile.",
      );
    });
  }, [data, store]);

  return null;
}
