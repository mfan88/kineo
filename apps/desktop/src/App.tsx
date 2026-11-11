import { RouterProvider } from "react-router";
import { createAppRouter } from "./router";

const router = createAppRouter();

export default function App() {
  return <RouterProvider router={router} />;
}
