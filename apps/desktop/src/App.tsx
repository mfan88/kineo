import { RouterProvider } from "react-router";
import { ToastHost } from "./components/Toasts";
import { createAppRouter } from "./router";

const router = createAppRouter();

/** The screens. The store comes from LocalSessionProvider (main.tsx). */
export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastHost />
    </>
  );
}
