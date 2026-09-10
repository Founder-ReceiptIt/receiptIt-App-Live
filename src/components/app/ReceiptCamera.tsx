import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X } from 'lucide-react';
import { CaptureQualityAssist } from './CaptureQualityAssist';

interface ReceiptCameraProps {
  onClose: () => void;
  onCapture: (file: File) => void;
}

// Capture only: photos still enter ScanTab's existing validation/review pipeline.
export function ReceiptCamera({ onClose, onCapture }: ReceiptCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const capturingRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    setReady(false);
    setError('');
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Camera capture isn’t available in this browser. Open receiptIt in your device’s browser, or close this view and use Upload from device.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
          if (!cancelled) { stop(); setReady(false); setError('The camera stopped. Try opening it again.'); }
        }, { once: true }));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (failure) {
        if (cancelled) return;
        stop();
        const name = failure instanceof DOMException ? failure.name : '';
        setError(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Allow camera access in your browser or device settings, then try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device. Close this view and use Upload from device.'
            : 'We couldn’t open the camera. Close any other app using it, then try again.');
      }
    })();
    const pause = () => {
      if (document.visibilityState !== 'hidden') return;
      cancelled = true;
      stop();
      setReady(false);
      setError('Camera paused while you were away. Open it again when you’re ready.');
    };
    document.addEventListener('visibilitychange', pause);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', pause); };
  }, [attempt]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready || capturingRef.current || !video.videoWidth || !video.videoHeight) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      // Bound local camera frames so three sections fit the existing 20MP
      // multi-image safety limit, without changing it or cropping any evidence.
      const scale = Math.min(1, 2560 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Camera frame unavailable');
      // Preserve the entire frame and its actual orientation; never crop evidence.
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob) throw new Error('Camera frame unavailable');
      if (mountedRef.current && document.visibilityState !== 'hidden') {
        onCapture(new File([blob], `receipt-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      }
    } catch {
      if (mountedRef.current) setError('The photo couldn’t be captured. Try again.');
    } finally {
      capturingRef.current = false;
      if (mountedRef.current) setCapturing(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Receipt camera" tabIndex={-1}
        className="flex h-[100dvh] min-w-0 flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] outline-none"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); onClose(); }
          if (event.key !== 'Tab') return;
          const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
          const first = buttons[0]; const last = buttons[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 text-white">
          <h2 className="text-lg font-semibold">Scan receipt</h2>
          <button type="button" aria-label="Close camera" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20"><X className="h-5 w-5" /></button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/15 bg-white/5">
          <video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" className="h-full w-full object-contain"
            onLoadedData={() => { if (streamRef.current && document.visibilityState !== 'hidden') setReady(true); }} />
          <CaptureQualityAssist videoRef={videoRef} enabled={ready && !error && !capturing} />
          {(!ready || error) && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/90 p-5 text-center text-sm text-gray-200">{error || 'Opening camera…'}</div>}
        </div>
        <div className="mx-auto mt-3 w-full max-w-md shrink-0">
          {error ? <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-12 w-full rounded-xl bg-teal-400 px-4 py-3 font-semibold text-black">Try camera again</button>
            : <button type="button" disabled={!ready || capturing} onClick={() => void capture()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-400 px-4 py-3 font-semibold text-black disabled:opacity-50"><Camera className="h-5 w-5" />{capturing ? 'Taking photo…' : 'Take photo'}</button>}
        </div>
      </div>
    </div>, document.body,
  );
}
