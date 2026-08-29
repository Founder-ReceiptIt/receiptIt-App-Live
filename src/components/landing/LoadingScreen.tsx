import { motion } from 'framer-motion';
import { ReceiptItWordmark } from '../ReceiptItWordmark';

export function LoadingScreen() {
  return (
    <div className="ri-auth-page ri-page-height flex items-center justify-center overflow-x-clip">
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-8"
        >
          <div className="absolute inset-0 blur-3xl bg-teal-400/20" />
          <h1 className="relative z-10"><ReceiptItWordmark className="text-6xl md:text-7xl" /></h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="text-xl text-gray-400 font-light tracking-wide"
        >
          Your purchases, kept private.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, delay: 0.14 }}
          className="mt-12 flex items-center justify-center gap-2"
        >
          <motion.div
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="w-2 h-2 bg-teal-400 rounded-full"
          />
          <motion.div
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
            className="w-2 h-2 bg-teal-400 rounded-full"
          />
          <motion.div
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            className="w-2 h-2 bg-teal-400 rounded-full"
          />
        </motion.div>
      </div>
    </div>
  );
}
