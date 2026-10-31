// Offline shell for the installed app (home page). Never caches account data or API calls.
const CACHE = "wcia-app-v3";
const SHELL = ["/", "/app/app.css", "/app/app.js", "/app/api.js", "/app/owner.js", "/app/i18n.js", "/app/config.js", "/app/manifest.webmanifest", "/media/mark.svg", "/media/icon-180.png", "/media/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Supabase & fonts go straight to the network
  if (u.pathname.startsWith("/comercial") || u.pathname.startsWith("/media/photos")) return; // the commercial page is not part of the app
  // Network first so updates show right away; fall back to the cached shell when offline.
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
