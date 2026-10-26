import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./desktop";
import { DesktopSurface } from "./DesktopSurface";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DesktopSurface>
        <App />
      </DesktopSurface>
    </ErrorBoundary>
  </React.StrictMode>,
);
