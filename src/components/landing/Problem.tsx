import { motion } from 'framer-motion';
import { Mail, AlertCircle, X } from 'lucide-react';

export function Problem() {
  const spamEmails = [
    { from: 'marketing@retailer.com', subject: '50% OFF EVERYTHING!!!', time: '2m ago' },
    { from: 'deals@store.com', subject: 'Your exclusive offer expires TODAY', time: '5m ago' },
    { from: 'noreply@shop.com', subject: 'We miss you! Come back for 20% off', time: '12m ago' },
    { from: 'newsletter@brand.com', subject: 'BLACK FRIDAY PREVIEW SALE', time: '18m ago' },
    { from: 'promo@outlet.com', subject: 'FINAL HOURS: Extra 30% off clearance', time: '25m ago' },
  ];

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
            Your inbox is <span className="text-red-400">not</span> a file cabinet.
          </h2>
          <p className="text-xl text-gray-400">
            Every receipt, every purchase, every warranty drowning in promotional spam.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-red-500/20 to-orange-500/20 blur-3xl" />

          <div className="relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 overflow-hidden">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
              <Mail className="w-6 h-6 text-gray-400" />
              <span className="text-gray-300 font-semibold">Primary Inbox</span>
              <div className="ml-auto flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span className="font-bold">2,847 unread</span>
              </div>
            </div>

            <div className="space-y-3">
              {spamEmails.map((email, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="backdrop-blur-md bg-red-500/10 border border-red-500/20 rounded-lg p-4 hover:bg-red-500/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-sm text-gray-400 truncate">{email.from}</span>
                      </div>
                      <p className="text-white font-semibold truncate">{email.subject}</p>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{email.time}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 text-center text-gray-500 text-sm">
              ...and 2,842 more just like these
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
