import { profileWithSignUpName } from "@kineo/shared";
import { useToast } from "heroui-native";
import { useEffect } from "react";
import { usePracticeDataIfReady, usePracticeWriter } from "@/data/practice-data";
import { userMessage } from "@/utils/user-message";
import { takeSignUpName } from "./sign-up-name";

/**
 * After creating an account on this phone: once the practice has been read, the full
 * name given at sign-up becomes Your profile's full name (only if it's still empty).
 * Renders nothing.
 */
export function SignUpProfileName() {
  const data = usePracticeDataIfReady();
  const writer = usePracticeWriter();
  const { toast } = useToast();

  useEffect(() => {
    if (!data) return;
    const name = takeSignUpName();
    if (name === null) return;
    const fields = profileWithSignUpName(data.profile, name);
    if (!fields) return;
    writer.saveProfile(fields).catch((caught: unknown) => {
      toast.show({
        variant: "danger",
        label:
          userMessage(caught) ?? "Your name couldn't be saved. Add it in Settings, Your profile.",
      });
    });
  }, [data, writer, toast]);

  return null;
}
