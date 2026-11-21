// Network-only worker: private pages, media and API responses are never cached here.
if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
