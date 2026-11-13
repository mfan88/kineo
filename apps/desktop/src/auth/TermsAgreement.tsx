import { Button, Checkbox, Label } from "@heroui/react";
import { LEGAL_LINKS, openInBrowser } from "../components/legal";

/**
 * "I agree to the Terms and Privacy policy", with links to read both on the line
 * below (a link inside the label would tick the box), and the error under it.
 */
export function TermsAgreement({
  agreed,
  onChange,
  error,
}: {
  agreed: boolean;
  onChange: (agreed: boolean) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Checkbox isSelected={agreed} isInvalid={error !== null} onChange={onChange}>
        {/* Content is the clickable label, so the box goes inside it. */}
        <Checkbox.Content className="flex min-h-11 flex-row items-center gap-3">
          <Checkbox.Control className="border-muted in-data-[selected=true]:border-transparent">
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Label>I agree to the Terms and Privacy policy</Label>
        </Checkbox.Content>
      </Checkbox>
      <p className="flex items-center gap-1 pl-8 text-sm text-muted">
        Read the
        {LEGAL_LINKS.map((link, index) => (
          <span key={link.href} className="flex items-center gap-1">
            {index > 0 ? "and" : null}
            <Button
              variant="ghost"
              className="h-11 px-1 text-accent"
              onPress={() => openInBrowser(link.href)}
            >
              {link.label === "Privacy" ? "Privacy policy" : link.label}
            </Button>
          </span>
        ))}
      </p>
      {error ? (
        <p role="alert" className="pl-8 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
