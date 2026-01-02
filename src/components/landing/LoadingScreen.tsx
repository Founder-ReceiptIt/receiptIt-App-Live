import { motion } from 'framer-motion';

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mb-8"
        >
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 blur-3xl bg-teal-400/30"
          />
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight relative z-10">
            <span className="text-white">receipt</span>
            <span className="text-teal-400">It</span>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-xl text-gray-400 font-light tracking-wide"
        >
          Privacy First. Finances Sorted.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 flex items-center justify-center gap-2"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            className="w-2 h-2 bg-teal-400 rounded-full"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
            className="w-2 h-2 bg-teal-400 rounded-full"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            className="w-2 h-2 bg-teal-400 rounded-full"
          />
        </motion.div>
      </div>
    </div>
  );
}
