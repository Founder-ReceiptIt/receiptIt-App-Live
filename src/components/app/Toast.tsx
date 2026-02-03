import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export function Toast() {
  const { toasts } = useToast();

  return (
    <div className="fixed top-8 right-8 z-50 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-auto mb-4"
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#121212] border border-[#2DD4BF]/30">
              <CheckCircle className="w-5 h-5 text-[#2DD4BF] flex-shrink-0" strokeWidth={2} />
              <div className="flex flex-col gap-0.5">
                <p className="text-white text-sm font-medium">
                  {toast.message}
                </p>
                {toast.merchant && (
                  <p className="text-gray-400 text-xs">
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
