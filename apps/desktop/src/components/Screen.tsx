import { ArrowLeft, Gear } from "@gravity-ui/icons";
import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { LEGAL_LINKS, openInBrowser } from "./legal";
import { Wordmark } from "./Wordmark";

interface ScreenProps {
  /** The screen's heading. Anything that isn't text is a loading placeholder for it. */
  title: ReactNode;
  /** Above the heading: small text such as today's date on Home, or an invoice's status tag. */
  eyebrow?: ReactNode;
  /** A larger heading, for an amount (an invoice's total on its detail screen). */
  large?: boolean;
  /** Beside the heading, such as a draft's status tag and "Saved on this device". */
  aside?: ReactNode;
  /** A quiet line under the heading, such as "Last visit 4 Nov · Right ankle". */
  subtitle?: string | null;
  /** Show the back arrow at the top left. Every screen except Home has one. */
  back?: boolean;
  /** One action at the top right of the content, such as a screen's one secondary button. */
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
 * Layout for every desktop screen: no top bar and no sidebar. The wordmark sits in
 * the window's top-left corner and a quiet tab bar (Home, Invoices and the settings
 * icon) in its top-right corner; then a back arrow (every screen but Home) above the
 * heading, then the content. Settings and its screens leave both corners empty and
 * show a small wordmark with the Terms and Privacy links at the bottom instead.
 */
export function Screen({
  title,
  eyebrow,
  large = false,
  aside,
  subtitle,
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
        <>
          {/* Absolute, not fixed: both corners scroll away with the page, so content
              never slides underneath them (there's no bar behind them to hide it). */}
          <div className="absolute top-6 left-8">
            <Wordmark size={24} />
          </div>
          <TabBar pathname={pathname} />
        </>
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
        <div className={`flex flex-col ${large ? "items-start gap-2" : "gap-1"}`}>
          {typeof eyebrow === "string" ? (
            <p className="text-sm text-muted">{eyebrow}</p>
          ) : (
            (eyebrow ?? null)
          )}
          {typeof title === "string" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                className={
                  large
                    ? "text-[34px] leading-tight font-bold tracking-tight tabular-nums"
                    : "text-[28px] leading-tight font-semibold"
                }
              >
                {title}
              </h1>
              {aside}
            </div>
          ) : (
            <div aria-hidden="true" className="flex h-9 items-center">
              {title}
            </div>
          )}
          {subtitle ? (
            <p className={large ? "text-[15px] text-muted" : "text-sm text-muted"}>{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
      {settings ? <LegalFooter /> : null}
    </main>
  );
}

const TABS = [
  { label: "Home", to: "/", current: (pathname: string) => pathname === "/" },
  {
    label: "Invoices",
    to: "/invoices",
    current: (pathname: string) => pathname === "/invoices",
  },
] as const;

/**
 * The quiet tab bar in the window's top-right corner: Home and Invoices as text links
 * (the one you're on marked) and the settings icon. Patients are found from Home.
 */
function TabBar({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  return (
    <nav aria-label="Main" className="absolute top-4 right-6 flex items-center gap-1">
      {TABS.map((tab) => {
        const current = tab.current(pathname);
        return (
          <a
            key={tab.to}
            href={tab.to}
            aria-current={current ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              void navigate(tab.to);
            }}
            className={`flex h-11 items-center rounded-xl px-3 text-[15px] hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus ${
              current ? "font-semibold text-foreground" : "font-medium text-muted"
            }`}
          >
            {tab.label}
          </a>
        );
      })}
      <Button
        isIconOnly
        variant="ghost"
        aria-label="Settings"
        className="size-11 min-w-11"
        onPress={() => void navigate("/settings")}
      >
        <Gear width={20} height={20} aria-hidden />
      </Button>
    </nav>
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
