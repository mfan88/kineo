import type { ReactNode } from "react";
import { createMemoryRouter, Navigate, type RouteObject } from "react-router";
import { PracticeGate } from "./data/PracticeStoreProvider";
import { FundingTypes } from "./screens/FundingTypes";
import { Home } from "./screens/Home";
import { Invoice } from "./screens/Invoice";
import { InvoiceStyle } from "./screens/InvoiceStyle";
import { Invoices } from "./screens/Invoices";
import { NewPatient } from "./screens/NewPatient";
import { Patient } from "./screens/Patient";
import { PriceList } from "./screens/PriceList";
import { ReadyToInvoice } from "./screens/ReadyToInvoice";
import { Profile } from "./screens/Profile";
import { Settings } from "./screens/Settings";
import { FormSkeleton, HomeSkeleton, InvoicesSkeleton, PatientSkeleton } from "./screens/Skeletons";

/** A screen that reads the practice: it waits behind a skeleton in its own shape. */
function gated(screen: ReactNode, skeleton: (showBlocks: boolean) => ReactNode): ReactNode {
  return <PracticeGate skeleton={skeleton}>{screen}</PracticeGate>;
}

/** Every desktop screen. Each one is reached from Home and left with the back arrow. */
export const routes: RouteObject[] = [
  { path: "/", element: gated(<Home />, (showBlocks) => <HomeSkeleton showBlocks={showBlocks} />) },
  {
    path: "/patients/new",
    element: gated(<NewPatient />, (showBlocks) => (
      <FormSkeleton title="New patient" showBlocks={showBlocks} />
    )),
  },
  {
    path: "/patients/:patientId",
    element: gated(<Patient />, (showBlocks) => <PatientSkeleton showBlocks={showBlocks} />),
  },
  {
    path: "/ready-to-invoice",
    element: gated(<ReadyToInvoice />, (showBlocks) => (
      <FormSkeleton title="Ready to invoice" showBlocks={showBlocks} />
    )),
  },
  {
    path: "/invoices",
    element: gated(<Invoices />, (showBlocks) => <InvoicesSkeleton showBlocks={showBlocks} />),
  },
  {
    path: "/invoices/:invoiceId",
    element: gated(<Invoice />, (showBlocks) => (
      <FormSkeleton title="Invoice" wide showBlocks={showBlocks} />
    )),
  },
  {
    path: "/settings",
    element: gated(<Settings />, (showBlocks) => (
      <FormSkeleton title="Settings" showBlocks={showBlocks} />
    )),
  },
  {
    path: "/settings/profile",
    element: gated(<Profile />, (showBlocks) => (
      <FormSkeleton title="Your profile" showBlocks={showBlocks} />
    )),
  },
  {
    path: "/settings/price-list",
    element: gated(<PriceList />, (showBlocks) => (
      <FormSkeleton title="Price list and tax" showBlocks={showBlocks} />
    )),
  },
  {
    path: "/settings/invoice-style",
    element: gated(<InvoiceStyle />, (showBlocks) => (
      <FormSkeleton title="Invoice style" wide showBlocks={showBlocks} />
    )),
  },
  {
    path: "/settings/funding-types",
    element: gated(<FundingTypes />, (showBlocks) => (
      <FormSkeleton title="Funding types" showBlocks={showBlocks} />
    )),
  },
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
