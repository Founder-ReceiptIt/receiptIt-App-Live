import { ReceiptItIntroAnimation } from './ReceiptItIntroAnimation';

interface ProductIntroProps {
  onContinue: () => void;
}

export function ProductIntro({ onContinue }: ProductIntroProps) {
  return (
    <main className="ri-scroll-viewport z-[9999] bg-black">
      <div className="ri-scroll-viewport__inner py-3 sm:py-6">
        <section aria-label="How receiptIt works" className="w-full min-w-0 max-w-lg">
          <ReceiptItIntroAnimation onBegin={onContinue} />
        </section>
      </div>
    </main>
  );
}
