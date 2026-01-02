import { motion } from 'framer-motion';
import { Shield, Mail, Lock, ArrowRight } from 'lucide-react';

export function Solution() {
  return (
    <section className="min-h-screen flex items-center justify-center px-6 py-20">
      <div className="max-w-4xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-6xl font-bold mb-6 text-white">
            One alias. <span className="text-teal-400">Zero noise.</span>
          </h2>
          <p className="text-xl text-gray-400">
            Give retailers a unique receiptIt address. We capture your receipts, protect your warranty, and keep the spam away.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          className="relative mb-16"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-teal-400/20 to-cyan-400/20 blur-3xl" />

          <div className="relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center overflow-hidden">
            <motion.div
              animate={{
                rotate: [0, 5, -5, 0],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="inline-block mb-6"
            >
              <Shield className="w-16 h-16 text-teal-400" strokeWidth={1.5} />
            </motion.div>

            <div className="relative inline-block">
              <motion.div
                animate={{
                  scale: [1, 1.05, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -inset-4 blur-xl bg-teal-400/30 rounded-lg"
              />
              <div className="relative text-5xl md:text-6xl font-bold text-teal-400 tracking-tight bg-gradient-to-r from-teal-300 to-cyan-400 bg-clip-text text-transparent">
                steve@receiptIt.app
              </div>
            </div>

            <p className="mt-6 text-gray-400 text-lg">
              Your cryptographic shield for every transaction
            </p>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Mail,
              title: 'Receipt Capture',
              description: 'Receipts automatically extracted and organized'
            },
            {
              icon: Shield,
              title: 'Warranty Tracking',
              description: 'Never lose another warranty or return window'
            },
            {
              icon: Lock,
              title: 'Auto-Delete',
              description: 'Emails vanish after warranty expires'
            }
          ].map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all hover:border-teal-400/30"
            >
              <feature.icon className="w-10 h-10 text-teal-400 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400">{feature.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
            <span>Scroll to see the product</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
