import { createMemoryRouter, Navigate } from "react-router";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";

/**
 * Desktop screens. In-memory history: a Tauri window has no address bar, and every
 * screen is reached from Home and left with the back arrow.
 */
export const router = createMemoryRouter([
  { path: "/", element: <Home /> },
  { path: "/settings", element: <Settings /> },
  // Anything unknown goes Home rather than showing a blank window.
  { path: "*", element: <Navigate to="/" replace /> },
]);
