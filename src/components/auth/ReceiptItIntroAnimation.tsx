import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

type StoryElement = HTMLElement & { readonly paused: boolean; play(): void; pause(): void };
const animationModule = '/intro/revision-05/receiptit-story.js';
const fallbackDescription = 'Illustration: use a receiptIt email at checkout instead of your personal email. The purchase and original receipt are saved in receiptIt.';

export function ReceiptItIntroAnimation() {
  const host = useRef<HTMLDivElement>(null);
  const story = useRef<StoryElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let disposed = false;
    let release = () => {};
    setReady(false);
    setFailed(false);

    // Self-hosted supplied artwork; never depend on the local review server.
    void import(/* @vite-ignore */ animationModule).then(async ({ fontsReady }) => {
      await fontsReady;
      if (disposed || !host.current) return;
      const element = document.createElement('receiptit-story') as StoryElement;
      element.setAttribute('variant', 'full');
      element.setAttribute('layout', 'signup');
      element.setAttribute('mode', 'animated');
      const updateState = () => setPaused(element.paused);
      element.addEventListener('playstatechange', updateState);
      host.current.appendChild(element);
      story.current = element;
      updateState();
      setReady(true);
      release = () => {
        element.removeEventListener('playstatechange', updateState);
        // Removal cancels the supplied element's animation and observers.
        element.remove();
        story.current = null;
      };
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => { disposed = true; release(); };
  }, [reducedMotion]);

  const animated = ready && !failed && !reducedMotion;
  return (
    <div className="mx-auto w-full max-w-[412px]">
      <div className="relative aspect-[390/540] w-full bg-black">
        <img src="/intro/revision-05/signup-slot-static.png" alt={animated ? '' : fallbackDescription}
          aria-hidden={animated || undefined} width={780} height={1080}
          className={`absolute inset-0 h-full w-full object-contain ${animated ? 'invisible' : ''}`} />
        <div ref={host} className="absolute inset-0" />
      </div>
      {!reducedMotion && !failed && (
        <div className="mt-1 flex h-11 justify-end">
          <button type="button" disabled={!ready}
            aria-label={paused ? 'Play animation' : 'Pause animation'}
            title={paused ? 'Play animation' : 'Pause animation'}
            onClick={() => story.current?.paused ? story.current.play() : story.current?.pause()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-0">
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}
