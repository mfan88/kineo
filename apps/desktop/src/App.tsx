import { RouterProvider } from "react-router";
import { SignUpProfileName } from "./auth/SignUpProfileName";
import { ToastHost } from "./components/Toasts";
import { appRouter } from "./router";

/** The screens. The store comes from LocalSessionProvider (main.tsx). */
export default function App() {
  return (
    <>
      <RouterProvider router={appRouter} />
      <SignUpProfileName />
      <ToastHost />
    </>
  );
}
