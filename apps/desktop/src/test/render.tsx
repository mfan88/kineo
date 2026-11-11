import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router";
import { ToastHost } from "../components/Toasts";
import { DemoStoreProvider } from "../data/DemoStoreProvider";
import { DemoStore } from "../data/store";
import { createAppRouter } from "../router";

/**
 * Renders the whole app starting at `path`, with a fresh demo store (or the one
 * given) and a user-event instance for clicks and typing.
 */
export function renderApp(path = "/", store = new DemoStore()) {
  const router = createAppRouter([path]);
  const user = userEvent.setup();
  return {
    user,
    router,
    store,
    ...render(
      <DemoStoreProvider store={store}>
        <RouterProvider router={router} />
        <ToastHost />
      </DemoStoreProvider>,
    ),
  };
}
