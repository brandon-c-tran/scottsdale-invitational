/* Float's pages (float/PROTOCOL.md "Pages"), chosen by path. src/main.jsx
   renders this instead of the Field Day app for any path under /float, so a
   Float page never opens the tournament socket. Each page is its own chunk. */
import React, { Suspense, lazy } from "react";

const Screen = lazy(() => import("./screen/ScreenApp.jsx"));
const Controller = lazy(() => import("./controller/ControllerApp.jsx"));
const Art = lazy(() => import("./art/ArtApp.jsx"));

export const isFloatPath = (pathname = "") => pathname === "/float" || pathname.startsWith("/float/");

export function floatPage(pathname = "") {
  if (pathname.startsWith("/float/play")) return "controller";
  if (pathname.startsWith("/float/art")) return "art";
  return "screen";
}

export default function FloatPages({ pathname }) {
  const page = floatPage(pathname);
  const Page = page === "controller" ? Controller : page === "art" ? Art : Screen;
  return <Suspense fallback={<main style={{ minHeight:"100vh", background:"#0b1220" }} />}><Page /></Suspense>;
}
