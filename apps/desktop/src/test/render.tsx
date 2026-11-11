import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router";
import { createAppRouter } from "../router";

/** Renders the whole app starting at `path`, with a user-event instance for clicks and typing. */
export function renderApp(path = "/") {
  const router = createAppRouter([path]);
  const user = userEvent.setup();
  return { user, router, ...render(<RouterProvider router={router} />) };
}
