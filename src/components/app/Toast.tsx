import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export function Toast() {
  const { toasts } = useToast();

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none w-full max-w-md px-4">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3, type: "spring" }}
            className="pointer-events-auto mb-4"
          >
            <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-[#121212] border-2 border-[#2DD4BF]/40 shadow-[0_0_30px_rgba(45,212,191,0.3)] backdrop-blur-xl">
              <CheckCircle className="w-6 h-6 text-[#2DD4BF] flex-shrink-0" strokeWidth={2} />
              <div className="flex flex-col gap-0.5">
                <p className="text-white text-sm font-bold">
                  {toast.message}
                </p>
                {toast.merchant && (
                  <p className="text-gray-400 text-xs font-medium">
                    {toast.merchant}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
