import { ChevronRight } from "@gravity-ui/icons";
import { useNavigate } from "react-router";
import { AccountSection } from "../components/AccountSection";
import { Screen } from "../components/Screen";

interface Section {
  title: string;
  description: string;
  /** Where the row goes. */
  path: string;
}

const SECTIONS: Section[] = [
  {
    title: "Your profile",
    description: "Your name, clinic and contact details, and which appear on invoices.",
    path: "/settings/profile",
  },
  {
    title: "Price list and tax",
    description: "What you charge, your default tax rate and invoice numbers.",
    path: "/settings/price-list",
  },
  {
    title: "Invoice style",
    description: "Logo, colour, font and layout of your invoices.",
    path: "/settings/invoice-style",
  },
];

/** Settings, reached from the icon on Home. */
export function Settings() {
  const navigate = useNavigate();

  return (
    <Screen back title="Settings">
      <ul
        aria-label="Settings"
        className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
      >
        {SECTIONS.map(({ title, description, path }) => (
          <li key={title}>
            <button
              type="button"
              onClick={() => void navigate(path)}
              className="flex min-h-16 w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted">{description}</span>
              </span>
              <ChevronRight width={16} height={16} aria-hidden className="text-muted" />
            </button>
          </li>
        ))}
      </ul>
      <AccountSection />
    </Screen>
  );
}
