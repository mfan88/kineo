import { appLinkFrom } from "./signed-in.ts";

const heading = document.getElementById("signed-in-heading");
const text = document.getElementById("signed-in-text");
const button = document.getElementById("signed-in-open");

const link = appLinkFrom(window.location.search);

if (heading && text && button instanceof HTMLAnchorElement) {
  heading.textContent = "You're signed in to Kineō";
  text.textContent = "Kineō is opening. You can close this tab.";
  button.href = link;
  button.hidden = false;
}

// Keep the one-time token out of the address bar and history before opening the app.
window.history.replaceState(null, "", window.location.pathname);
window.location.href = link;
