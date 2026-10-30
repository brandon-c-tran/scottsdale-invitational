/* Float's entry (float.html). Renders the page for this path; Field Day's
   app and its tournament socket never load here. */
import React from "react";
import { createRoot } from "react-dom/client";
import FloatPages from "./FloatPages.jsx";

createRoot(document.getElementById("float-root")).render(<FloatPages pathname={window.location.pathname} />);
