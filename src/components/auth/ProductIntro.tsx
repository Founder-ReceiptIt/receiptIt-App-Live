import { motion } from 'framer-motion';
import { Archive, MailPlus, RotateCcw, ShieldCheck } from 'lucide-react';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

interface ProductIntroProps {
  onContinue: () => void;
  onSignIn: () => void;
}

const benefits = [
  {
    icon: MailPlus,
    label: 'Add purchases your way',
    copy: 'Scan a receipt, share it from your phone, upload a PDF or send it to your private receipt email.',
  },
  {
    icon: Archive,
    label: 'We organise the rest',
    copy: 'receiptIt keeps the original, understands the purchase and makes it searchable.',
  },
  {
    icon: RotateCcw,
    label: 'Useful after checkout',
    copy: 'Keep returns, warranties and proof together when you need them.',
  },
];

export function ProductIntro({ onContinue, onSignIn }: ProductIntroProps) {
  return (
    <main className="ri-scroll-viewport z-[9999] bg-[#050505]">
      <div className="ri-scroll-viewport__inner py-3 sm:py-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          aria-labelledby="product-intro-title"
          className="w-full min-w-0 max-w-4xl pb-24 md:pb-0"
        >
          <ReceiptItWordmark className="text-3xl sm:text-4xl" />

          <div className="mt-7 max-w-3xl sm:mt-10">
            <h1 id="product-intro-title" className="text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl">
              Everything after the purchase,<br className="hidden sm:block" /> handled.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-300 sm:text-base sm:leading-7">
              receiptIt keeps the proof, organises what you bought and helps manage the admin that comes afterwards.
            </p>
          </div>

          <div className="mt-6 grid gap-2.5 md:mt-8 md:grid-cols-3 md:gap-3">
            {benefits.map(({ icon: Icon, label, copy }) => (
              <div key={label} className="flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:block md:p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-teal-300/20 bg-teal-400/10">
                  <Icon className="h-4 w-4 text-teal-300" strokeWidth={1.7} />
                </div>
                <div className="min-w-0 md:mt-4">
                  <h2 className="text-xs font-bold uppercase tracking-[0.13em] text-white">{label}</h2>
                  <p className="mt-1.5 text-xs leading-5 text-gray-400 sm:text-sm sm:leading-6">{copy}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex min-w-0 items-start gap-3 rounded-2xl border border-teal-300/15 bg-teal-400/[0.055] p-4 sm:mt-6">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" strokeWidth={1.7} />
            <p className="text-xs leading-5 text-gray-300 sm:text-sm sm:leading-6">
              <span className="font-bold text-white">Private by design.</span>{' '}
              Your purchase history is there to help you — not advertise to you.
            </p>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-black/90 px-4 py-3 pb-[max(0.75rem,var(--ri-safe-bottom))] backdrop-blur-xl md:static md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <div className="mx-auto flex max-w-4xl items-center gap-2.5 md:mx-0 md:gap-3">
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl bg-teal-400 px-4 py-3 text-sm font-bold text-black transition-colors hover:bg-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black md:max-w-44 md:px-6"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center px-2 py-2 text-xs font-semibold text-gray-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 min-[380px]:text-sm md:max-w-xs md:flex-none md:px-3"
              >
                Already have an account? Sign in
              </button>
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
