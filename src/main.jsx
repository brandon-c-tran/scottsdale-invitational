import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppErrorBoundary } from "./ui/AppErrorBoundary.jsx";
import { reloadForUpdate } from "./lib/client.js";

/* Update ready is a chip in the app header (ui/UpdateReady.jsx); the reload
   itself goes through the transport so a stuck cached build stops retrying. */
createRoot(document.getElementById("root")).render(<AppErrorBoundary>
  <App onUpdateReload={reloadForUpdate} />
</AppErrorBoundary>);
