import { Gear } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import { useNavigate } from "react-router";
import { Screen } from "../components/Screen";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** Home: where everything starts. Its content comes in the Home screen task. */
export function Home() {
  const navigate = useNavigate();

  return (
    <Screen
      eyebrow={dateFormat.format(new Date())}
      title="Who are you seeing?"
      action={
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Settings"
          className="-mr-2 size-11 min-w-11"
          onPress={() => void navigate("/settings")}
        >
          <Gear width={20} height={20} aria-hidden />
        </Button>
      }
    />
  );
}
