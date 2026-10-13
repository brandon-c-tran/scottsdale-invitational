/* YouTube's IFrame Player API, loaded once for the whole app: the win
   song's snippet preview, the karaoke picker's preview on a phone and the
   karaoke player on the TV all wait on this one promise, so the API's
   global ready callback is set once and an earlier one is still called.
   Nothing runs at import time (tests bundle this for node). Never add a
   no-referrer policy anywhere: YouTube refuses an embed without a referrer
   (error 153). */
const API_URL = "https://www.youtube.com/iframe_api";
let apiPromise = null;

export function loadYouTube() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const earlier = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { earlier?.(); } catch {} resolve(window.YT); };
    const script = document.createElement("script");
    script.src = API_URL;
    script.async = true;
    script.onerror = () => { apiPromise = null; reject(new Error("YouTube unavailable")); };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/* the player's states (YT.PlayerState) and the error codes karaoke reads */
export const YT_STATE = Object.freeze({ UNSTARTED:-1, ENDED:0, PLAYING:1, PAUSED:2, BUFFERING:3, CUED:5 });
/* 2 a bad id, 5 an HTML5 error, 100 removed or private, 101 and 150 not
   playable in an embed (the owner or a rights claim), 153 no referrer */
export const YT_ERRORS = Object.freeze([2, 5, 100, 101, 150, 153]);
