/* Larder moved to /FoodAssistant/larder/. This retires the old worker at /FoodAssistant/. */
self.addEventListener("install", function () { self.skipWaiting(); });

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf("larder-") === 0 && key !== "larder-4";
      }).map(function (key) { return caches.delete(key); }));
    }).then(function () {
      return self.registration.unregister();
    })
  );
});
