// Simple Web Worker FFI

export function spawn(scriptUrl) {
  return function () {
    const url = scriptUrl.startsWith('/') ? scriptUrl : `/${scriptUrl.replace(/^\.?\//, '')}`;
    return new Worker(url, { type: 'module' });
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
