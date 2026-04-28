const CACHE="adzan-pro-v1.0.8";

self.addEventListener("install",e=>{
  e.waitUntil(
    caches.open(CACHE).then(cache=>{
      return cache.addAll([
        "./",
        "./index.html",
        "./style.css",
        "./app.js",
        "./libs/praytimes.js"
      ]);
    })
  );
});

self.addEventListener("fetch",e=>{
  e.respondWith(
    caches.match(e.request).then(res=>res||fetch(e.request))
  );
});
