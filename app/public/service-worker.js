self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Always use the server's current authorization and state, including after a restart.
self.addEventListener('fetch',()=>{});
