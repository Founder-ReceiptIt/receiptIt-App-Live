import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

interface HeroProps {
  onReserve: () => void;
}

export function Hero({ onReserve }: HeroProps) {
  return (
    <section className="min-h-screen flex items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(45,212,191,0.1)_0%,_transparent_70%)]" />

      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-teal-400/30 rounded-full"
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            scale: Math.random() * 0.5 + 0.5,
          }}
          animate={{
            y: [null, Math.random() * window.innerHeight],
            x: [null, Math.random() * window.innerWidth],
            scale: [null, Math.random() * 0.5 + 0.5],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: Math.random() * 10 + 10,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      <div className="relative z-10 max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 inline-block"
        >
          <div className="relative">
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 blur-3xl bg-teal-400/20"
            />
            <Shield className="w-24 h-24 text-teal-400 relative z-10" strokeWidth={1.5} />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl md:text-7xl font-bold mb-6 tracking-tight"
        >
          <span className="text-white">Stop giving retailers</span>
          <br />
          <span className="text-white">your </span>
          <span className="text-teal-400">real email.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-xl md:text-2xl text-gray-400 mb-12 font-light tracking-wide"
        >
          The privacy firewall for your financial life.
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onReserve}
          className="relative group"
        >
          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 0.8, 0.5]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 blur-xl bg-teal-400/50 rounded-full"
          />
          <div className="relative px-12 py-5 bg-teal-400 text-black font-bold text-lg rounded-full backdrop-blur-xl border border-teal-300 shadow-[0_0_30px_rgba(45,212,191,0.5)]">
            Reserve Alias
          </div>
        </motion.button>
      </div>
    </section>
  );
}
