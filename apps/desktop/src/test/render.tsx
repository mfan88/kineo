import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router";
import { AccountContext, type Account } from "../auth/account";
import { ToastHost } from "../components/Toasts";
import { DemoStoreProvider } from "../data/DemoStoreProvider";
import { DemoStore } from "../data/store";
import { createAppRouter } from "../router";

/**
 * Renders the whole app starting at `path`, with a fresh demo store (or the one
 * given) and a user-event instance for clicks and typing. Pass `account` to render
 * as a signed-in practitioner (Settings then shows Sign out).
 */
export function renderApp(path = "/", store = new DemoStore(), account: Account | null = null) {
  const router = createAppRouter([path]);
  const user = userEvent.setup();
  return {
    user,
    router,
    store,
    ...render(
      <AccountContext.Provider value={account}>
        <DemoStoreProvider store={store}>
          <RouterProvider router={router} />
          <ToastHost />
        </DemoStoreProvider>
      </AccountContext.Provider>,
    ),
  };
}
