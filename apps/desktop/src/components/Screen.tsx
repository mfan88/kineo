import { ArrowLeft } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { LEGAL_LINKS, openInBrowser } from "./legal";
import { Wordmark } from "./Wordmark";

interface ScreenProps {
  /** The screen's heading. Anything that isn't text is a loading placeholder for it. */
  title: ReactNode;
  /** Small text above the heading, such as today's date on Home. */
  eyebrow?: string | null;
  /** Show the back arrow at the top left. Every screen except Home has one. */
  back?: boolean;
  /** One icon button at the top right. Only Home has one (settings). */
  action?: ReactNode;
  /** Use a wider column, for screens with a side-by-side preview. */
  wide?: boolean;
  children?: ReactNode;
}

/** Settings and its screens (profile, price list, invoice style). */
function isSettings(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

/**
 * Layout for every desktop screen. There is no top bar and no sidebar: just a back
 * arrow (or, on Home, the settings icon) above the heading, then the content.
 * The wordmark sits in the window's top-left corner, except in Settings, which
 * shows a small wordmark with the Terms and Privacy links at the bottom instead.
 */
export function Screen({
  title,
  eyebrow,
  back = false,
  action,
  wide = false,
  children,
}: ScreenProps) {
  const { pathname } = useLocation();
  const settings = isSettings(pathname);

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      {settings ? null : (
        <div className="fixed top-6 left-8">
          <Wordmark size={24} />
        </div>
      )}
      {/* Starts below the corner wordmark, on every screen, so nothing shifts between them. */}
      <div
        className={`mx-auto flex w-full ${wide ? "max-w-6xl" : "max-w-3xl"} flex-col gap-6 px-8 pt-16 pb-12`}
      >
        <div className="flex h-11 items-center justify-between">
          {back ? <BackButton /> : <span />}
          {action}
        </div>
        {/* A plain div, not <header>: a page-level header reads as a top bar (banner). */}
        <div className="flex flex-col gap-1">
          {eyebrow ? <p className="text-sm text-muted">{eyebrow}</p> : null}
          {typeof title === "string" ? (
            <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
          ) : (
            <div aria-hidden="true" className="flex h-9 items-center">
              {title}
            </div>
          )}
        </div>
        {children}
      </div>
      {settings ? <LegalFooter /> : null}
    </main>
  );
}

/** Bottom middle of Settings: a small wordmark with the Terms and Privacy links. */
function LegalFooter() {
  return (
    <footer className="mt-auto flex flex-col items-center gap-2 pt-6 pb-8">
      <Wordmark size={20} />
      <nav aria-label="Legal" className="flex gap-4 text-sm">
        {LEGAL_LINKS.map(({ label, href }) => (
          <a
            key={href}
            href={href}
            className="text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            onClick={(event) => {
              event.preventDefault();
              openInBrowser(href);
            }}
          >
            {label}
          </a>
        ))}
      </nav>
    </footer>
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
