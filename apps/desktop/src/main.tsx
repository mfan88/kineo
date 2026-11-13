import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthGate } from "./auth/AuthGate";
import { AuthProvider } from "./auth/AuthProvider";
import { LocalSessionProvider } from "./data/LocalSessionProvider";
import "./styles.css";
import { startAppearance } from "./theme/appearance";

// Light or dark from the Appearance setting (Match system by default), before the first paint.
startAppearance();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html.");
}

// From apps/desktop/.env.local (git-ignored). A publishable key, so it may be in app code.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY isn't set. Add it to apps/desktop/.env.local (see apps/desktop/README.md).",
  );
}

createRoot(root).render(
  <StrictMode>
    <AuthProvider publishableKey={publishableKey}>
      <AuthGate>
        <LocalSessionProvider>
          <App />
        </LocalSessionProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
);
