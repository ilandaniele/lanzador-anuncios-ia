import "@fontsource-variable/archivo/wdth.css";
import "./styles/tokens.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { createQueryClient } from "./lib/query-client";
import { installGlobalErrorReporting } from "./lib/report-error";
import { createAppRouter } from "./router";

installGlobalErrorReporting();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={createAppRouter()} />
    </QueryClientProvider>
  </StrictMode>,
);
