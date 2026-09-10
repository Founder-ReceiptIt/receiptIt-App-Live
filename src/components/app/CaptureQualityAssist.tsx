import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { CAPTURE_ADVICE, settleCaptureAdvice } from '../../lib/captureQuality';
import type { AdviceMemory, QualityResult } from '../../lib/captureQuality';

interface Props { videoRef: RefObject<HTMLVideoElement>; enabled: boolean }

export function CaptureQualityAssist({ videoRef, enabled }: Props) {
  const [quality, setQuality] = useState<QualityResult | null>(null);
  const latestRef = useRef<QualityResult | null>(null);

  useEffect(() => {
    setQuality(null);
    latestRef.current = null;
    if (!enabled || typeof Worker === 'undefined') return;
    let worker: Worker;
    let context: CanvasRenderingContext2D | null;
    const canvas = document.createElement('canvas');
    try {
      context = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
      if (!context) return;
      worker = new Worker(new URL('../../lib/captureQuality.worker.ts', import.meta.url), { type: 'module' });
    } catch { return; }

    let stopped = false;
    let timer = 0;
    let watchdog = 0;
    let slowFrames = 0;
    let analysedFrames = 0;
    let readCost = 0;
    let basicOnly = false;
    let interval = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 ? 800 : 350;
    let sampleSize = interval === 800 ? 128 : 160;
    let memory: AdviceMemory = { candidate: 'neutral', consecutive: 0, shown: 'neutral', shownAt: performance.now() - 2000, longShown: false };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(watchdog);
      worker.terminate();
      canvas.width = canvas.height = 0;
    };
    const unavailable = () => { if (stopped) return; stop(); latestRef.current = null; setQuality(null); };
    const sample = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (document.visibilityState !== 'visible') { unavailable(); return; }
      if (!video || video.readyState < 2 || !video.videoWidth || video.paused) { timer = window.setTimeout(sample, interval); return; }
      try {
        const started = performance.now();
        const scale = Math.min(1, sampleSize / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(8, Math.round(video.videoWidth * scale));
        const height = Math.max(8, Math.round(video.videoHeight * scale));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        context!.drawImage(video, 0, 0, width, height);
        const pixels = context!.getImageData(0, 0, width, height).data;
        readCost = performance.now() - started;
        // Only one frame can be in flight. No analysis backlog competes with shutter.
        worker.postMessage({ width, height, pixels, basicOnly }, [pixels.buffer]);
        watchdog = window.setTimeout(unavailable, 2000);
      } catch { unavailable(); }
    };
    worker.onmessage = (event: MessageEvent<{ result?: QualityResult; elapsed?: number; unavailable?: boolean }>) => {
      if (stopped) return;
      window.clearTimeout(watchdog);
      if (event.data.unavailable || !event.data.result) { unavailable(); return; }
      // Degrade for sustained pressure, not two unrelated GC/startup pauses.
      analysedFrames++;
      // Ignore initial video/worker warm-up when choosing the sustained budget.
      if (analysedFrames > 3) slowFrames = readCost > 8 || (event.data.elapsed || 0) > 12 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames >= 3) { basicOnly = true; interval = 1000; sampleSize = 128; }
      if (slowFrames >= 6) { unavailable(); return; }
      const result = event.data.result;
      memory = settleCaptureAdvice(memory, result.advice, performance.now());
      // Never leave a reassuring teal Ready state on a newly poor/lost frame.
      const advice = memory.shown === 'ready' && (result.advice !== 'ready' || memory.consecutive < 3) ? 'neutral' : memory.shown;
      const displayed = { ...result, advice };
      // Smooth stable geometry only; discard it immediately if detection is lost.
      const previous = latestRef.current;
      if (displayed.boundary && previous?.boundary) {
        displayed.boundary = displayed.boundary.map(([x, y], i) => [x * 0.65 + previous.boundary![i][0] * 0.35, y * 0.65 + previous.boundary![i][1] * 0.35]);
      }
      latestRef.current = displayed;
      setQuality(displayed);
      timer = window.setTimeout(sample, interval);
    };
    worker.onerror = event => { event.preventDefault(); unavailable(); };
    worker.onmessageerror = unavailable;
    const onVisibility = () => { if (document.visibilityState !== 'visible') unavailable(); };
    document.addEventListener('visibilitychange', onVisibility);
    timer = window.setTimeout(sample, 250);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled, videoRef]);

  if (!enabled || !quality) return null;
  const tone = quality.advice === 'ready' ? 'text-teal-300' : quality.advice === 'neutral' ? 'text-gray-300' : 'text-amber-200';
  const guideHeight = quality.height * 0.78;
  const guideWidth = Math.min(quality.width * 0.72, guideHeight * 0.56);
  return (
    <div className={`pointer-events-none absolute inset-0 ${tone}`}>
      <svg aria-hidden="true" viewBox={`0 0 ${quality.width} ${quality.height}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
        {quality.boundary
          ? <polygon points={quality.boundary.map(([x, y]) => `${x * quality.width},${y * quality.height}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.8" strokeLinejoin="round" />
          : <rect x={(quality.width - guideWidth) / 2} y={(quality.height - guideHeight) / 2} width={guideWidth} height={guideHeight} rx="3" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="5 7" opacity="0.35" />}
      </svg>
      <div className="absolute inset-x-2 bottom-3 flex justify-center">
        <p role="status" aria-live="polite" aria-atomic="true" className="max-w-full rounded-full border border-white/10 bg-black/85 px-3 py-1.5 text-center text-xs font-medium leading-5">{CAPTURE_ADVICE[quality.advice]}</p>
      </div>
    </div>
  );
}
