import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Camera, CheckCircle, Loader2, FileImage } from 'lucide-react';
import { useState, useRef } from 'react';

type ScanState = 'idle' | 'scanning' | 'processing' | 'success';

export function ScanTab() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      startScan();
    }
  };

  const startScan = () => {
    setScanState('scanning');
    setTimeout(() => {
      setScanState('processing');
      setTimeout(() => {
        setScanState('success');
        setTimeout(() => {
          resetScan();
        }, 2000);
      }, 2000);
    }, 1500);
  };

  const resetScan = () => {
    setScanState('idle');
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancel = () => {
    resetScan();
  };

  return (
    <div className="pb-32 px-6 pt-8 min-h-screen flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center justify-between mb-8"
      >
        <h1 className="text-3xl font-bold text-white">Scan Receipt</h1>
        <div className="text-xl font-bold tracking-tight">
          <span className="text-white">receipt</span>
          <span className="text-teal-400">It</span>
        </div>
      </motion.div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {scanState === 'idle' && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <div className="text-center mb-8">
                  <Camera className="w-20 h-20 text-teal-400 mx-auto mb-4" strokeWidth={1.5} />
                  <h2 className="text-2xl font-bold text-white mb-2">Scan Your Receipt</h2>
                  <p className="text-gray-400">Upload a photo or scan to get started</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="space-y-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full backdrop-blur-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <Upload className="w-5 h-5 text-teal-400" />
                      <span className="font-semibold text-white">Upload from Gallery</span>
                    </div>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full backdrop-blur-xl bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <Camera className="w-5 h-5 text-white" />
                      <span className="font-semibold text-white">Take Photo</span>
                    </div>
                  </button>
                </div>

                <p className="text-xs text-gray-500 text-center mt-6">
                  Supports JPG, PNG up to 10MB
                </p>
              </motion.div>
            )}

            {(scanState === 'scanning' || scanState === 'processing') && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <div className="text-center mb-6">
                  {previewUrl && (
                    <div className="relative mb-6 rounded-xl overflow-hidden border border-white/10">
                      <img
                        src={previewUrl}
                        alt="Receipt preview"
                        className="w-full h-64 object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                      {scanState === 'scanning' && (
                        <motion.div
                          initial={{ top: 0 }}
                          animate={{ top: '100%' }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                          className="absolute left-0 right-0 h-0.5 bg-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.8)]"
                        />
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-center mb-4">
                    {scanState === 'scanning' ? (
                      <FileImage className="w-16 h-16 text-teal-400 animate-pulse" strokeWidth={1.5} />
                    ) : (
                      <Loader2 className="w-16 h-16 text-teal-400 animate-spin" strokeWidth={1.5} />
                    )}
                  </div>

                  <h2 className="text-2xl font-bold text-white mb-2">
                    {scanState === 'scanning' ? 'Scanning Receipt...' : 'Processing Data...'}
                  </h2>
                  <p className="text-gray-400 mb-6">
                    {scanState === 'scanning'
                      ? 'Analyzing receipt image'
                      : 'Extracting merchant, amount, and date'
                    }
                  </p>

                  <div className="flex items-center justify-center gap-2 mb-6">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                      className="w-2 h-2 bg-teal-400 rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                      className="w-2 h-2 bg-teal-400 rounded-full"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                      className="w-2 h-2 bg-teal-400 rounded-full"
                    />
                  </div>

                  <button
                    onClick={handleCancel}
                    className="backdrop-blur-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-xl px-6 py-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <X className="w-4 h-4 text-red-400" />
                      <span className="font-semibold text-red-400">Cancel</span>
                    </div>
                  </button>
                </div>
              </motion.div>
            )}

            {scanState === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.5, type: 'spring', bounce: 0.5 }}
                  >
                    <CheckCircle className="w-20 h-20 text-green-400 mx-auto mb-4" strokeWidth={1.5} />
                  </motion.div>

                  <h2 className="text-2xl font-bold text-white mb-2">Receipt Captured!</h2>
                  <p className="text-gray-400 mb-6">Your receipt has been successfully processed</p>

                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 mb-6 text-left">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Merchant:</span>
                        <span className="text-white font-semibold">Apple Store</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Amount:</span>
                        <span className="text-white font-semibold">£2,199.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Date:</span>
                        <span className="text-white font-semibold">29 Dec 2025</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-green-400 font-semibold">
                    Redirecting to wallet...
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
