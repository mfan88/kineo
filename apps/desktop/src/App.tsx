import { RouterProvider } from "react-router";
import { ToastHost } from "./components/Toasts";
import { DemoStoreProvider } from "./data/DemoStoreProvider";
import { createAppRouter } from "./router";

const router = createAppRouter();

export default function App() {
  return (
    <DemoStoreProvider>
      <RouterProvider router={router} />
      <ToastHost />
    </DemoStoreProvider>
  );
}
