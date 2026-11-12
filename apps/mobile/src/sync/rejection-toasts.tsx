import { uploadRejectionMessage } from "@kineo/shared";
import { useToast } from "heroui-native";
import { useEffect } from "react";
import type { Connector } from "./connector";

/**
 * Shows each change the server refused (a locked invoice, say) as an error toast,
 * in the server's words where they're meant for people. Renders nothing.
 */
export function RejectionToasts({ connector }: { connector: Connector }) {
  const { toast } = useToast();
  useEffect(
    () =>
      connector.onRejected((rejection) =>
        toast.show({ variant: "danger", label: uploadRejectionMessage(rejection) }),
      ),
    [connector, toast],
  );
  return null;
}
