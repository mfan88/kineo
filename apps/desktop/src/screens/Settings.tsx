import { ChevronRight, CircleExclamation, FileText, ListUl, Person } from "@gravity-ui/icons";
import {
  invoiceStyleSummary,
  priceListSummary,
  profileProblem,
  profileSummary,
} from "@kineo/shared";
import type { ComponentType, SVGProps } from "react";
import { useNavigate } from "react-router";
import { AccountSection } from "../components/AccountSection";
import { AppearanceSection } from "../components/AppearanceSection";
import { Screen } from "../components/Screen";
import { usePracticeData } from "../data/PracticeStoreProvider";

interface Section {
  title: string;
  /** What the row is for, when its value alone doesn't say. */
  description?: string;
  /** The current value, or what's wrong (a problem is drawn in the error colour). */
  summary: string;
  problem?: string | null;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { width?: number; height?: number }>;
  /** Where the row goes. */
  path: string;
}

/** Settings, reached from the icon on Home: each row shows its current value or problem. */
export function Settings() {
  const navigate = useNavigate();
  const { profile, priceItems, settings, invoiceStyle } = usePracticeData();

  const problem = profileProblem(profile);
  const sections: Section[] = [
    {
      title: "Your profile",
      description: "Your name, clinic and contact details, and which show on invoices",
      summary: profileSummary(profile).text,
      problem,
      Icon: Person,
      path: "/settings/profile",
    },
    {
      title: "Price list and tax",
      summary: priceListSummary(priceItems.length, settings.defaultTaxRateBasisPoints),
      Icon: ListUl,
      path: "/settings/price-list",
    },
    {
      title: "Invoice style",
      summary: invoiceStyleSummary(invoiceStyle),
      Icon: FileText,
      path: "/settings/invoice-style",
    },
  ];

  return (
    <Screen back title="Settings">
      <ul
        aria-label="Settings"
        className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
      >
        {sections.map(({ title, description, summary, problem: issue, Icon, path }) => (
          <li key={title}>
            <button
              type="button"
              onClick={() => void navigate(path)}
              className="flex min-h-[76px] w-full items-center gap-4 px-5 py-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span
                aria-hidden
                className="flex size-10 flex-none items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground"
              >
                <Icon width={20} height={20} />
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-semibold">{title}</span>
                <span className="text-sm text-muted">{description ?? summary}</span>
                {issue ? (
                  <span className="inline-flex items-center gap-1 text-sm text-danger">
                    <CircleExclamation width={13} height={13} aria-hidden />
                    {issue}
                  </span>
                ) : null}
              </span>
              <ChevronRight width={16} height={16} aria-hidden className="text-muted" />
            </button>
          </li>
        ))}
      </ul>
      <AppearanceSection />
      <AccountSection />
    </Screen>
  );
}
