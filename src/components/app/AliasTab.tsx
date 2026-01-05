import { motion } from 'framer-motion';
import { Copy, Check, Shield, Mail, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function AliasTab() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [alias, setAlias] = useState('');
  const [stats, setStats] = useState([
    { label: 'Receipts Captured', value: '0', icon: Mail },
    { label: 'Spam Blocked', value: '0', icon: Lock },
    { label: 'Warranties Tracked', value: '0', icon: Shield },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setLoading(false);
        return;
      }

      if (data) {
        setAlias(data.email_alias);
        setStats([
          { label: 'Receipts Captured', value: data.receipts_captured.toString(), icon: Mail },
          { label: 'Spam Blocked', value: data.spam_blocked.toLocaleString(), icon: Lock },
          { label: 'Warranties Tracked', value: data.warranties_tracked.toString(), icon: Shield },
        ]);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  const handleCopy = () => {
    navigator.clipboard.writeText(alias);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pb-32 px-6 pt-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Your Alias</h1>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-400/10 to-transparent" />

          <div className="relative">
            <div className="flex items-center justify-center mb-6">
              <motion.div
                animate={{
                  rotate: [0, 5, -5, 0],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Shield className="w-20 h-20 text-teal-400" strokeWidth={1.5} />
              </motion.div>
            </div>

            <div className="text-center mb-6">
              <motion.div
                animate={{
                  scale: [1, 1.02, 1],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-3xl font-bold text-teal-400 mb-2"
              >
                {alias}
              </motion.div>
              <p className="text-gray-400 text-sm">
                Use this email at checkout to protect your privacy
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCopy}
              className="w-full relative group"
            >
              <div className={`absolute inset-0 blur-xl transition-all duration-300 ${
                copied ? 'bg-green-400/30' : 'bg-teal-400/30'
              }`} />

              <div className={`relative flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all duration-300 backdrop-blur-md border ${
                copied
                  ? 'bg-green-400/20 border-green-400/40 text-green-400'
                  : 'bg-teal-400/20 border-teal-400/40 text-teal-400'
              }`}>
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    <span>Copy Alias</span>
                  </>
                )}
              </div>
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 text-center"
            >
              <stat.icon className="w-6 h-6 text-teal-400 mx-auto mb-2" strokeWidth={1.5} />
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-gray-400">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">How it works</h3>
          <div className="space-y-4">
            {[
              { step: '1', text: 'Use your alias email at any online store' },
              { step: '2', text: 'We capture the receipt and extract warranty info' },
              { step: '3', text: 'Promotional emails are automatically filtered' },
              { step: '4', text: 'After warranty expires, emails auto-delete' },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                className="flex items-start gap-3"
              >
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-teal-400/20 border border-teal-400/30 flex items-center justify-center text-teal-400 font-bold text-sm">
                  {item.step}
                </div>
                <p className="text-gray-300 pt-1">{item.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
