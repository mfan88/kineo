/**
 * The full name typed at sign-up, held for this session only, until the practice
 * has been read and it can go into Your profile (see SignUpProfileName). Never stored.
 */
let pending: string | null = null;

export function rememberSignUpName(fullName: string): void {
  const trimmed = fullName.trim();
  pending = trimmed === "" ? null : trimmed;
}

/** The name, once: taking it clears it. */
export function takeSignUpName(): string | null {
  const name = pending;
  pending = null;
  return name;
}
