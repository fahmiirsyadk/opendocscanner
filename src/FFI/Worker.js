// Simple Web Worker FFI

export function spawn(scriptUrl) {
  return function () {
    // Ensure absolute URL so SPA routing doesn't rewrite to index.html
    try {
      const absolute = new URL(scriptUrl, window.location.origin).toString();
      return new Worker(absolute);
    } catch (_) {
      // Fallback: prefix with "/" if needed
      const normalized = scriptUrl.startsWith('/')
        ? scriptUrl
        : '/' + scriptUrl.replace(/^\.?\//, '');
      return new Worker(normalized);
    }
  };
}

export function post_(worker) {
  return function (payload) {
    return function () {
      worker.postMessage(payload);
    };
  };
}

export function terminate(worker) {
  return function () {
    worker.terminate();
  };
}

export function onMessage_(worker) {
  return function (handler) {
    return function () {
      worker.onmessage = function (e) {
        // Pass through the raw tagged object (expects { tag, ... })
        handler(e.data)();
      };
    };
  };
}
