// Responsibilities:
// - Run one call into a plugin WASM module off the UI thread.
// Contracts:
// - Every call gets a fresh worker and instance. That keeps plugin memory
//   isolated between calls and lets the timeout kill a module that hangs.

type WasmPluginResponse = { id: string; ok: true; output: string } | { id: string; ok: false; error: string };

export function runWasmTransform(
  pluginId: string,
  callId: string,
  timeoutMs: number,
  bytes: Uint8Array,
  input: string,
) {
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL("../pluginWorker.ts", import.meta.url), { type: "module" });
    const requestId = `${pluginId}:${callId}:${Date.now()}`;
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`Plugin ${pluginId}/${callId} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    const finish = () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WasmPluginResponse>) => {
      if (event.data.id !== requestId) {
        return;
      }

      finish();

      if (event.data.ok) {
        resolve(event.data.output);
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message));
    };
    worker.postMessage({ id: requestId, bytes, input });
  });
}
