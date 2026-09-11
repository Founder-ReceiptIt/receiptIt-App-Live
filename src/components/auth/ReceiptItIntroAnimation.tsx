import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

type StoryElement = HTMLElement & { readonly paused: boolean; readonly completed: boolean; readonly finale: boolean; readonly beginReady: boolean; play(): void; pause(): void; replay(): void };
const animationModule = '/intro/revision-06/receiptit-story.js?v=16-app';
const fallbackDescription = 'How receiptIt works. 1. Make a purchase: shop as normal. 2. receiptIt gives you your receiptIt email; give it to the retailer when they ask where to send your receipt. 3. Your personal inbox stays separate; receiptIt receives and privately saves your receipt. 4. Find your saved, organised purchase and original receipt in your receiptIt Wallet. Give the retailer less of you, while giving you more from your purchases.';

export function ReceiptItIntroAnimation({ onBegin }: { onBegin: (method: 'completed' | 'skipped') => void }) {
  const host = useRef<HTMLDivElement>(null);
  const beginAction = useRef(onBegin);
  useEffect(() => { beginAction.current = onBegin; }, [onBegin]);
  const story = useRef<StoryElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [beginReady, setBeginReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setBeginReady(false);
    if (reducedMotion) return;
    let disposed = false;
    let release = () => {};
    setReady(false);
    setFailed(false);

    // Self-hosted supplied artwork; never depend on the local review server.
    // An absolute same-origin URL also keeps Vite from treating the public file as source.
    const moduleUrl = new URL(animationModule, window.location.origin).href;
    void import(/* @vite-ignore */ moduleUrl).then(async ({ fontsReady }) => {
      await fontsReady;
      if (disposed || !host.current) return;
      const element = document.createElement('receiptit-story') as StoryElement;
      element.setAttribute('variant', 'full');
      element.setAttribute('layout', 'signup');
      element.setAttribute('mode', 'animated');
      const updateState = () => { setPaused(element.paused); setBeginReady(element.beginReady); };
      element.addEventListener('playstatechange', updateState);
      element.addEventListener('finalestatechange', updateState);
      const handleBegin = () => beginAction.current(element.beginReady ? 'completed' : 'skipped');
      element.addEventListener('begin', handleBegin);
      host.current.appendChild(element);
      story.current = element;
      updateState();
      setReady(true);
      release = () => {
        element.removeEventListener('playstatechange', updateState);
        element.removeEventListener('finalestatechange', updateState);
        element.removeEventListener('begin', handleBegin);
        // Removal cancels the supplied element's animation and observers.
        element.remove();
        story.current = null;
      };
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => { disposed = true; release(); };
  }, [reducedMotion]);

  const animated = ready && !failed && !reducedMotion;
  const showFallback = reducedMotion || failed;
  return (
    <div className="mx-auto w-full max-w-[412px]">
      <div className="relative w-full bg-black" aria-busy={!animated && !showFallback}>
        {showFallback && <img src="/intro/revision-06/reduced-motion.png?v=9" alt={fallbackDescription}
          className="block h-auto w-full" />}
        {!animated && !showFallback && <div className="aspect-[390/540] w-full" aria-hidden="true" />}
        <div ref={host} className={animated ? '' : 'hidden'} />
      </div>
      {(reducedMotion || failed) && <div className="flex justify-center py-6"><button type="button" onClick={() => onBegin('skipped')} className="min-h-12 rounded-xl bg-teal-400 px-6 py-3 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Let's begin</button></div>}
      {!reducedMotion && !failed && (
        <div className={`mt-1 flex h-11 justify-end ${beginReady ? 'invisible' : ''}`}>
          <button type="button" disabled={!ready}
            aria-label={paused ? 'Play animation' : 'Pause animation'}
            title={paused ? 'Play animation' : 'Pause animation'}
            onClick={() => {
              if (!story.current) return;
              if (story.current.paused) story.current.play();
              else story.current.pause();
            }}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-0">
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}
