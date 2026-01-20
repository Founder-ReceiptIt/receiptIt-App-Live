import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Camera, CheckCircle, Loader2, FileImage } from 'lucide-react';
import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type ScanState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

interface ScanTabProps {
  onNavigateToWallet: () => void;
}

export function ScanTab({ onNavigateToWallet }: ScanTabProps) {
  const { user, emailAlias } = useAuth();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log('[ScanTab] File selected:', file.name);
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      // Set uploading state IMMEDIATELY to show modal without delay
      setScanState('uploading');
      await startScan(file);
    }
  };

  const startScan = async (file: File) => {
    if (!user) {
      setErrorMessage('User not authenticated');
      setScanState('error');
      return;
    }

    // State is already set to 'uploading' in handleFileSelect for immediate feedback
    console.log('[ScanTab] Starting upload to storage...');

    try {
      const timestamp = Date.now();
      const fileExt = file.name.split('.').pop();
      const fileName = `${timestamp}_${file.name}`;
      const filePath = `${user.id}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        setErrorMessage(`Failed to upload file: ${uploadError.message}`);
        setScanState('error');
        return;
      }

      const storagePath = uploadData.path;

      const { data: publicUrlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;

      setScanState('processing');

      try {
        const referenceNumber = `REF-${timestamp}`;
        const userEmailAlias = emailAlias || `user_${user.id.slice(0, 8)}@receipts.app`;

        const { data: insertData, error: insertError } = await supabase
          .from('receipts')
          .insert({
            user_id: user.id,
            storage_path: storagePath,
            image_url: publicUrl,
            status: 'processing',
            merchant: 'Analyzing...',
            amount: 0,
            subtotal: 0,
            vat: 0,
            date: new Date().toISOString().split('T')[0],
            tag: 'Processing',
            reference_number: referenceNumber,
            email_alias: userEmailAlias,
          })
          .select();

        if (insertError) {
          console.error('Insert error:', insertError);
          setErrorMessage(`Failed to create database record: ${insertError.message}`);
          setScanState('error');
          throw insertError;
        }

        if (!insertData || insertData.length === 0) {
          setErrorMessage('Failed to verify receipt record creation');
          setScanState('error');
          return;
        }

        console.log('Receipt created successfully:', insertData);
      } catch (err) {
        console.error('Scan error:', err);
        throw err;
      }

      console.log('[ScanTab] Upload successful, showing success message for 2.5 seconds');
      setScanState('success');
      setTimeout(() => {
        console.log('[ScanTab] Navigating to wallet...');
        resetScan();
        onNavigateToWallet();
      }, 2500);
    } catch (error) {
      setErrorMessage(`An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setScanState('error');
    }
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
    <div className="pb-32 px-6 pt-8 min-h-screen flex flex-col max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white">Scan Receipt</h1>
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
                  accept="image/*,application/pdf"
                  capture="environment"
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
                  Supports JPG, PNG, PDF up to 10MB
                </p>
              </motion.div>
            )}

            {(scanState === 'uploading' || scanState === 'processing') && (
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

                      {scanState === 'uploading' && (
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
                    {scanState === 'uploading' ? (
                      <FileImage className="w-16 h-16 text-teal-400 animate-pulse" strokeWidth={1.5} />
                    ) : (
                      <Loader2 className="w-16 h-16 text-teal-400 animate-spin" strokeWidth={1.5} />
                    )}
                  </div>

                  <h2 className="text-2xl font-bold text-white mb-2">
                    {scanState === 'uploading' ? 'Uploading Receipt...' : 'Creating Entry...'}
                  </h2>
                  <p className="text-gray-400 mb-6">
                    {scanState === 'uploading'
                      ? 'Uploading your receipt to secure storage'
                      : 'Creating placeholder for AI processing'
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

                  <h2 className="text-2xl font-bold text-white mb-2">Upload Successful!</h2>
                  <p className="text-gray-400 mb-6">Your receipt is being processed by AI</p>

                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                    <p className="text-sm text-gray-400">
                      Your receipt will appear in your wallet with extracted data once processing is complete.
                    </p>
                  </div>

                  <p className="text-sm text-green-400 font-semibold">
                    Redirecting to wallet...
                  </p>
                </div>
              </motion.div>
            )}

            {scanState === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="backdrop-blur-xl bg-white/5 border border-red-400/20 rounded-2xl p-8"
              >
                <div className="text-center">
                  <X className="w-20 h-20 text-red-400 mx-auto mb-4" strokeWidth={1.5} />

                  <h2 className="text-2xl font-bold text-white mb-2">Upload Failed</h2>
                  <p className="text-gray-400 mb-6">{errorMessage || 'An error occurred during upload'}</p>

                  <button
                    onClick={resetScan}
                    className="w-full backdrop-blur-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 rounded-xl py-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="font-semibold text-teal-400">Try Again</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
