import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppErrorBoundary } from "./ui/AppErrorBoundary.jsx";
import { UpdateReady } from "./ui/UpdateReady.jsx";

createRoot(document.getElementById("root")).render(<AppErrorBoundary>
  <App />
  <UpdateReady />
</AppErrorBoundary>);
