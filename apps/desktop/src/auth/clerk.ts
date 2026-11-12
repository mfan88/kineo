// Clerk in token mode (its Native API), as Clerk's Expo SDK does it. See the
// "Desktop sign-in" note in docs/tech-stack.md.
// The client token is kept in the OS keychain (sessionToken.ts), so the app stays
// signed in across restarts.
import { Clerk } from "@clerk/clerk-js";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  keychainTokenStore,
  memoryTokenStore,
  sessionToken,
  type TokenStore,
} from "./sessionToken";

interface NativeResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

// In the Tauri window, Clerk's requests are sent from Rust (src-tauri/src/clerk_http.rs):
// the webview always adds an Origin header, and Clerk refuses Origin plus Authorization.
function routeClerkThroughRust(frontendApiHost: string) {
  const webviewFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).host !== frontendApiHost) return webviewFetch(input, init);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const response = await invoke<NativeResponse>("clerk_request", {
      request: {
        method: request.method,
        url: request.url,
        headers: [...request.headers.entries()],
        body: hasBody ? await request.text() : null,
      },
    });
    return new Response(response.status === 204 ? null : response.body, {
      status: response.status,
      headers: response.headers,
    });
  };
}

export function createClerk(
  publishableKey: string,
  store: TokenStore = isTauri() ? keychainTokenStore : memoryTokenStore(),
): Clerk {
  const token = sessionToken(store);
  // A publishable key is "pk_test_" or "pk_live_" plus the base64 Frontend API host and "$".
  const frontendApiHost = atob(publishableKey.split("_")[2] ?? "").replace(/\$$/, "");
  if (isTauri()) routeClerkThroughRust(frontendApiHost);

  const clerk = new Clerk(publishableKey);
  // Clerk's own hook names (used by its Expo SDK); they can't be renamed.
  // oxlint-disable-next-line no-underscore-dangle
  clerk.__internal_onBeforeRequest(async (request) => {
    request.credentials = "omit";
    request.url?.searchParams.append("_is_native", "1");
    const headers = new Headers(request.headers);
    headers.set("authorization", await token.get());
    request.headers = headers;
  });
  // oxlint-disable-next-line no-underscore-dangle
  clerk.__internal_onAfterResponse(async (_request, response) => {
    await token.received(response?.headers.get("authorization") ?? null);
  });
  return clerk;
}
