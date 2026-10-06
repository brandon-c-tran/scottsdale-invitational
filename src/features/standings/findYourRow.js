import { prefersReducedMotion } from "../../lib/motion.js";

/* H7: your header reel is a shortcut to your own row on Home's leaderboard.
   Home may still be mounting (the tap can come from another tab), so this
   waits a few frames for the row, scrolls the row's own place in the list
   (not its sticky spot at the bottom of the screen) to the middle of the
   screen, then flashes it once. Returns a promise of whether it found it. */
const ROW = ".fd-home .fd-standings-list > li.is-you";
const FLASH_MS = 1600;

/* where the row sits in the list's flow, in page coordinates: under the row
   before it, or at the list's top when it leads */
function naturalTop(row) {
  const before = row.previousElementSibling;
  const top = before ? before.getBoundingClientRect().bottom : row.parentElement.getBoundingClientRect().top;
  return top + (window.scrollY || 0);
}

export function findYourRow({ frames = 30 } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  return new Promise(resolve => {
    let left = frames;
    const look = () => {
      const row = document.querySelector(ROW);
      if (!row) {
        if (left-- > 0) requestAnimationFrame(look);
        else resolve(false);
        return;
      }
      const reduced = prefersReducedMotion();
      const height = row.getBoundingClientRect().height;
      const top = Math.max(0, naturalTop(row) - (window.innerHeight - height) / 2);
      window.scrollTo({ top, behavior:reduced ? "auto" : "smooth" });
      row.removeAttribute("data-flash");
      void row.offsetWidth;
      row.setAttribute("data-flash", "");
      setTimeout(() => row.removeAttribute("data-flash"), FLASH_MS);
      resolve(true);
    };
    look();
  });
}
