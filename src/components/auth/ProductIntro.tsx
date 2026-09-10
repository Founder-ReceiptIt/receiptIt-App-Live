import { ReceiptItWordmark } from '../ReceiptItWordmark';
import { ReceiptItIntroAnimation } from './ReceiptItIntroAnimation';

interface ProductIntroProps {
  onContinue: () => void;
}

export function ProductIntro({ onContinue }: ProductIntroProps) {
  return (
    <main className="ri-scroll-viewport z-[9999] bg-black">
      <div className="ri-scroll-viewport__inner py-3 sm:py-6">
        <section aria-labelledby="product-intro-title" className="w-full min-w-0 max-w-lg pb-24 md:pb-0">
          <h1 id="product-intro-title" className="relative -top-2 text-center">
            <ReceiptItWordmark className="text-3xl sm:text-4xl" />
          </h1>

          <div className="mt-4 sm:mt-6">
            <ReceiptItIntroAnimation />
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-black/90 px-4 py-3 pb-[max(0.75rem,var(--ri-safe-bottom))] backdrop-blur-xl md:static md:mt-4 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <div className="mx-auto flex max-w-[412px] items-center justify-center">
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl bg-teal-400 px-4 py-3 text-sm font-bold text-black transition-colors hover:bg-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black md:max-w-44 md:px-6"
              >
                Continue
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
