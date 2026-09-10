import { analyseCaptureFrame } from './captureQuality';
import type { QualityFrame } from './captureQuality';

let previous: Uint8Array | undefined;
self.onmessage = (event: MessageEvent<QualityFrame & { basicOnly: boolean }>) => {
  try {
    const started = performance.now();
    const analysis = analyseCaptureFrame(event.data, previous, event.data.basicOnly);
    previous = analysis.grey;
    // Raw preview pixels never leave this worker again; only advisory geometry/state.
    self.postMessage({ result: analysis.result, elapsed: performance.now() - started });
  } catch {
    previous = undefined;
    self.postMessage({ unavailable: true });
  }
};
