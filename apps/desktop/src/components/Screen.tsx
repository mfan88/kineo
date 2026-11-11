import { ArrowLeft } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

interface ScreenProps {
  /** The screen's heading. */
  title: string;
  /** Small text above the heading, such as today's date on Home. */
  eyebrow?: string | null;
  /** Show the back arrow at the top left. Every screen except Home has one. */
  back?: boolean;
  /** One icon button at the top right. Only Home has one (settings). */
  action?: ReactNode;
  children?: ReactNode;
}

/**
 * Layout for every desktop screen. There is no top bar and no sidebar: just a back
 * arrow (or, on Home, the settings icon) above the heading, then the content.
 */
export function Screen({ title, eyebrow, back = false, action, children }: ScreenProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 pt-6 pb-12">
        <div className="flex h-11 items-center justify-between">
          {back ? <BackButton /> : <span />}
          {action}
        </div>
        {/* A plain div, not <header>: a page-level header reads as a top bar (banner). */}
        <div className="flex flex-col gap-1">
          {eyebrow ? <p className="text-sm text-muted">{eyebrow}</p> : null}
          <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  );
}

function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  function goBack() {
    // "default" means this is the first screen shown, so there's nothing to go back
    // to; go Home instead of doing nothing.
    if (location.key === "default") {
      void navigate("/");
    } else {
      void navigate(-1);
    }
  }

  return (
    <Button
      isIconOnly
      variant="ghost"
      aria-label="Back"
      className="-ml-2 size-11 min-w-11"
      onPress={goBack}
    >
      <ArrowLeft width={20} height={20} aria-hidden />
    </Button>
  );
}
