import { createMemoryRouter, Navigate, type RouteObject } from "react-router";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";

/** Every desktop screen. Each one is reached from Home and left with the back arrow. */
export const routes: RouteObject[] = [
  { path: "/", element: <Home /> },
  { path: "/settings", element: <Settings /> },
  // Anything unknown goes Home rather than showing a blank window.
  { path: "*", element: <Navigate to="/" replace /> },
];

/**
 * In-memory history: a Tauri window has no address bar. `initialEntries` lets tests
 * start on any screen.
 */
export function createAppRouter(initialEntries: string[] = ["/"]) {
  return createMemoryRouter(routes, { initialEntries });
}
