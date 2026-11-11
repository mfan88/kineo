import { createMemoryRouter, Navigate, type RouteObject } from "react-router";
import { Home } from "./screens/Home";
import { Invoice } from "./screens/Invoice";
import { InvoicePreview } from "./screens/InvoicePreview";
import { Invoices } from "./screens/Invoices";
import { NewPatient } from "./screens/NewPatient";
import { Patient } from "./screens/Patient";
import { Settings } from "./screens/Settings";

/** Every desktop screen. Each one is reached from Home and left with the back arrow. */
export const routes: RouteObject[] = [
  { path: "/", element: <Home /> },
  { path: "/patients/new", element: <NewPatient /> },
  { path: "/patients/:patientId", element: <Patient /> },
  { path: "/invoices", element: <Invoices /> },
  { path: "/invoices/:invoiceId", element: <Invoice /> },
  { path: "/invoices/:invoiceId/preview", element: <InvoicePreview /> },
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
