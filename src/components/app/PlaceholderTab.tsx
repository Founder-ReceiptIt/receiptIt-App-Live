import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

interface PlaceholderTabProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function PlaceholderTab({ title, description, icon: Icon }: PlaceholderTabProps) {
  return (
    <div className="ri-mobile-page ri-page-height flex min-w-0 flex-col px-4 pt-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center justify-between mb-8"
      >
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        <ReceiptItWordmark className="text-xl" />
      </motion.div>

      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="text-center max-w-md"
        >
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12">
            <Icon className="w-20 h-20 text-teal-400 mx-auto mb-6" strokeWidth={1.5} />
            <h2 className="text-3xl font-bold text-white mb-4">{title}</h2>
            <p className="text-gray-400 text-lg">{description}</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
