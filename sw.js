// Publish gives each encrypted release a distinct cache. Keep the previous
// worker active if even one required page fails to download.
var PREFIX='fieldbook:'+self.registration.scope+':';
var SHELL=PREFIX+'shell-bfdc76b81d11d94f5743', TILES=PREFIX+'tiles-v1', TILE_LIMIT=600;
var PUBLISHED=true;
var FILES=['./','index.html','map.html','index.enc', 'map.enc','mark.svg','landscape.svg',
  'manifest.webmanifest','icon-180.png','icon-512.png','_next/static/css/index.CR9cs5DH.css'];
self.addEventListener('install',function(e){
  e.waitUntil((async function(){
    var c=await caches.open(SHELL);
    await c.addAll(FILES.map(function(f){return new Request(f,{cache:'reload'});}));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',function(e){
  e.waitUntil((async function(){
    var names=await caches.keys();
    await Promise.all(names.filter(function(k){return k.startsWith(PREFIX+'shell-') && k!==SHELL;}).map(function(k){return caches.delete(k);}));
    await self.clients.claim();
  })());
});
self.addEventListener('message',function(e){
  if(e.data!=='check-pages'||!e.ports[0]) return;
  e.waitUntil((async function(){
    var c=await caches.open(SHELL);
    var hits=await Promise.all(FILES.map(function(f){return c.match(f);}));
    e.ports[0].postMessage(hits.every(Boolean));
  })());
});
function trim(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= TILE_LIMIT) return;
    return Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map(function (k) { return cache.delete(k); }));
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === self.location.origin) {
    e.respondWith((async function(){
      var cache=await caches.open(SHELL), hit=await cache.match(req,{ignoreSearch:true});
      if(hit && PUBLISHED) return hit;
      if(hit){
        var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},3000);
        try {
          var fresh=await fetch(req,{cache:'no-cache',signal:controller.signal});
          if(!fresh.ok) return hit;
          await cache.put(req,fresh.clone());return fresh;
        }catch(err){return hit;}finally{clearTimeout(timer);}
      }
      return fetch(req);
    })());
    return;
  }
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(async function(res){if(res.ok){var cache=await caches.open(SHELL);await cache.put(req,res.clone());}return res;}); }));
    return;
  }
  if (/arcgisonline\.com|tile\.openstreetmap\.org|amazonaws\.com/.test(url.hostname)) {
    // Map tiles: saved copy first. Each tile that the map shows is saved for offline use.
    e.respondWith(caches.open(TILES).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') { e.waitUntil(c.put(req, res.clone()).then(function () { return trim(c); }).catch(function () {})); }
          return res;
        });
      });
    }));
  }
});
