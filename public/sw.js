/* Field Day pocket alerts. This worker only shows pushed notifications and
   opens the app when one is tapped. It has no fetch handler and caches
   nothing: every request still goes to the network, so builds, the build
   id and Update ready behave exactly as they do without it. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const text = value => typeof value === "string" ? value.slice(0, 200) : "";
  const url = text(data.url).startsWith("/") ? text(data.url) : "/";
  /* iOS requires every push to show a notification */
  event.waitUntil(self.registration.showNotification(text(data.title) || "Field Day", {
    body:text(data.body),
    ...(text(data.tag) ? { tag:text(data.tag) } : {}),
    icon:"/icon-192.png",
    data:{ url },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.url || "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type:"window", includeUncontrolled:true });
    const app = windows.find(client => {
      const url = new URL(client.url);
      return url.origin === self.location.origin && url.pathname !== "/tv" && !url.searchParams.has("tv");
    });
    if (app) {
      app.postMessage({ type:"fd-alert", url:target });
      return app.focus();
    }
    return self.clients.openWindow(target);
  })());
});
