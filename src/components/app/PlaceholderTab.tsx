import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface PlaceholderTabProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function PlaceholderTab({ title, description, icon: Icon }: PlaceholderTabProps) {
  return (
    <div className="pb-32 px-6 pt-8 min-h-screen flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center justify-between mb-8"
      >
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        <div className="text-xl font-bold tracking-tight">
          <span className="text-white">receipt</span>
          <span className="text-teal-400">It</span>
        </div>
      </motion.div>

      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
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
