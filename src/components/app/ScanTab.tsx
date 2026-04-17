import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Camera, CheckCircle, Loader2, FileImage, File } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

type ScanState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

interface ScanTabProps {
  onNavigateToWallet: () => void;
}

/**
 * Compute a SHA‑256 hash for the given file. This function reads the file
 * contents as an ArrayBuffer and then uses the SubtleCrypto API to
 * generate a hex‑encoded hash string. The resulting hash can be stored in
 * the `file_hash` column of the receipts table to enable exact duplicate
 * detection on the backend. See migrations/20260405105709_20260405_add_duplicate_detection.sql
 * for details.
 *
 * @param file The file to hash
 * @returns A promise that resolves to a lowercase hex string representing the SHA‑256 hash
 */
async function computeFileHash(file: File): Promise<string> {
  // Read the file contents into an ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  // Generate the digest. Note: SubtleCrypto API returns a promise
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  // Convert the buffer to a byte array so we can build a hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Convert each byte to a two‑digit hex string and join
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export function ScanTab({ onNavigateToWallet }: ScanTabProps) {
  const { user, emailAlias } = useAuth();
  const { showToast } = useToast();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isScanningRef = useRef(false);
  const activeScanTokenRef = useRef(0);
  const pendingReceiptIdRef = useRef<string | null>(null);

  const clearScanningStorage = () => {
    localStorage.removeItem('isScanning');
    localStorage.removeItem('scanningSource');
  };

  const isScanActive = (scanToken: number) => activeScanTokenRef.current === scanToken;

  const cleanupPendingReceipt = async (receiptId: string, userId: string) => {
    const { data: scopedReceipt, error: scopedReceiptError } = await supabase
      .from('receipts')
      .select('id')
      .eq('id', receiptId)
      .eq('user_id', userId)
      .maybeSingle();

    if (scopedReceiptError) {
      throw scopedReceiptError;
    }

    if (!scopedReceipt) {
      return;
    }

    const { error: receiptItemsError } = await supabase
      .from('receipt_items')
      .delete()
      .eq('receipt_id', receiptId);

    if (receiptItemsError) {
      throw receiptItemsError;
    }

    const { error: receiptPaymentsError } = await supabase
      .from('receipt_payments')
      .delete()
      .eq('receipt_id', receiptId);

    if (receiptPaymentsError) {
      throw receiptPaymentsError;
    }

    const { error: receiptDeleteError } = await supabase
      .from('receipts')
      .delete()
      .eq('id', receiptId)
      .eq('user_id', userId);

    if (receiptDeleteError) {
      throw receiptDeleteError;
    }
  };

  // ANDROID FIX: Restore scanning state after page reload (Android kills tab when camera opens)
  useEffect(() => {
    const isScanning = localStorage.getItem('isScanning');
    if (isScanning === 'true') {
      console.log('[ScanTab] Restored scanning state from localStorage after reload');
      // Show waiting state - the file picker should still deliver the file
      setScanState('uploading');
      isScanningRef.current = true;

      // ANDROID SAFETY: If no file arrives within 10 seconds, assume Android lost it
      const timeout = setTimeout(() => {
        console.log('[ScanTab] No file received after reload - Android likely lost the file');
        setErrorMessage('Android closed the camera. Please try uploading again.');
        setScanState('error');
        isScanningRef.current = false;
        clearScanningStorage();
      }, 10000);

      // Clean up timeout if component unmounts
      return () => clearTimeout(timeout);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    // CRITICAL: Prevent any default browser behavior
    e.preventDefault();
    e.stopPropagation();

    const file = e.target.files?.[0];
    if (!file || isScanningRef.current) {
      console.log('[ScanTab] File selection blocked - already scanning or no file');
      // Clear localStorage if no file selected (user cancelled)
      clearScanningStorage();
      return;
    }

    console.log('[ScanTab] File selected:', file.name, file.type, file.size);

    // Reset the input immediately to prevent re-triggering
    e.target.value = '';

    // VALIDATION 1: Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      console.error('[ScanTab] Invalid file type:', file.type);
      setErrorMessage('Unsupported file type. Please use JPG, PNG, or PDF.');
      setScanState('error');
      clearScanningStorage();
      showToast('Unsupported file type. Please use JPG, PNG, or PDF.', undefined);
      return;
    }

    // VALIDATION 2: Check file size (10MB limit)
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSizeBytes) {
      console.error('[ScanTab] File too large:', file.size, 'bytes');
      setErrorMessage('File too large. Max size is 10MB.');
      setScanState('error');
      clearScanningStorage();
      showToast('File too large. Max size is 10MB.', undefined);
      return;
    }

    // CRITICAL: Block all further interactions immediately
    isScanningRef.current = true;

    // FORCE synchronous render - this ensures the modal appears IMMEDIATELY on mobile
    flushSync(() => {
      const url = URL.createObjectURL(file);
      setSelectedFile(file);
      setPreviewUrl(url);
      setScanState('uploading');
    });

    console.log('[ScanTab] State set to uploading with flushSync, modal MUST be visible now');

    const scanToken = activeScanTokenRef.current + 1;
    activeScanTokenRef.current = scanToken;
    pendingReceiptIdRef.current = null;

    // Start the async upload process separately (not awaited in this handler)
    // Use setTimeout to ensure this happens AFTER the render
    setTimeout(() => {
      void startScan(file, scanToken);
    }, 0);
  };

  const startScan = async (file: File, scanToken: number) => {
    if (!isScanActive(scanToken)) {
      return;
    }

    if (!user) {
      if (isScanActive(scanToken)) {
        setErrorMessage('User not authenticated');
        setScanState('error');
        clearScanningStorage();
      }
      return;
    }

    // State is already set to 'uploading' in handleFileSelect for immediate feedback
    console.log('[ScanTab] Starting upload to storage...');

    try {
      // Kick off hashing in parallel with the upload. Computing the hash can take
      // some time for larger files, so starting it now means that the hash
      // should be ready by the time we insert the row.
      const fileHashPromise = computeFileHash(file);

      const timestamp = Date.now();

      // CRITICAL: Generate completely random filename (NO original filename, NO spaces, NO special chars)
      // 1. Get the extension (e.g., "png")
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';

      // 2. Create a clean, random filename (NO spaces, NO special chars)
      const fileName = `${Math.random().toString(36).substring(2)}_${timestamp}.${fileExt}`;

      // 3. Build the path
      const filePath = `${user.id}/${fileName}`;

      console.log('[ScanTab] Generated random filename:', fileName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        if (isScanActive(scanToken)) {
          setErrorMessage(`Failed to upload file: ${uploadError.message}`);
          setScanState('error');
          clearScanningStorage();
        }
        return;
      }

      if (!isScanActive(scanToken)) {
        return;
      }

      const storagePath = uploadData.path;

      const { data: publicUrlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;

      if (isScanActive(scanToken)) {
        setScanState('processing');
      }

      try {
        const referenceNumber = `REF-${timestamp}`;

        // Await the hash result. If computing the hash fails for any reason,
        // we'll just leave the file_hash undefined and allow the backend to
        // handle duplicate detection based on other keys. Wrap in try/catch to
        // avoid unhandled promise rejections.
        let fileHash: string | undefined;
        try {
          fileHash = await fileHashPromise;
        } catch (hashErr) {
          console.error('[ScanTab] Failed to compute file hash:', hashErr);
        }

        const { data: insertData, error: insertError } = await supabase
          .from('receipts')
          .insert({
            user_id: user.id,
            storage_path: storagePath,
            image_url: publicUrl,
            // Persist the file hash for exact duplicate detection when available
            ...(fileHash ? { file_hash: fileHash } : {}),
            status: 'processing',
            merchant: 'Analyzing...',
            amount: 0,
            subtotal: 0,
            vat_amount: 0,
            currency: 'GBP',
            transaction_date: null,
            category: 'Other',
            reference_number: referenceNumber,
          })
          .select();

        if (insertError) {
          console.error('Insert error:', insertError);
          if (isScanActive(scanToken)) {
            setErrorMessage(`Failed to create database record: ${insertError.message}`);
            setScanState('error');
            clearScanningStorage();
          }
          throw insertError;
        }

        if (!insertData || insertData.length === 0) {
          if (isScanActive(scanToken)) {
            setErrorMessage('Failed to verify receipt record creation');
            setScanState('error');
            clearScanningStorage();
          }
          return;
        }

        console.log('Receipt created successfully:', insertData);

        const merchant = insertData[0]?.merchant || undefined;
        const receiptId = insertData[0]?.id;
        if (receiptId) {
          pendingReceiptIdRef.current = receiptId;
        }

        if (!isScanActive(scanToken)) {
          if (receiptId) {
            try {
              await cleanupPendingReceipt(receiptId, user.id);
            } catch (cleanupError) {
              console.error('[ScanTab] Failed to clean up canceled receipt after insert:', cleanupError);
            }
          }
          return;
        }

        showToast('New receipt received', merchant !== 'Analyzing...' ? merchant : undefined);
      } catch (err) {
        console.error('Scan error:', err);
        throw err;
      }

      if (!isScanActive(scanToken)) {
        return;
      }

      console.log('[ScanTab] Showing processing state for 3.5 seconds');
      // Stay in processing state to show the scanning animation
      await new Promise(resolve => setTimeout(resolve, 3500));

      if (!isScanActive(scanToken)) {
        return;
      }

      console.log('[ScanTab] Showing success message for 2.5 seconds');
      setScanState('success');
      // ANDROID FIX: Clear localStorage on success
      clearScanningStorage();

      await new Promise(resolve => setTimeout(resolve, 2500));

      if (!isScanActive(scanToken)) {
        return;
      }

      console.log('[ScanTab] Navigating to wallet...');
      isScanningRef.current = false;
      resetScan();
      onNavigateToWallet();
    } catch (error) {
      console.error('[ScanTab] Error during scan:', error);
      if (isScanActive(scanToken)) {
        setErrorMessage(`An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setScanState('error');
        isScanningRef.current = false;
        // ANDROID FIX: Clear localStorage on error
        clearScanningStorage();
      }
    }
  };

  const resetScan = () => {
    console.log('[ScanTab] Resetting scan state');
    activeScanTokenRef.current += 1;
    isScanningRef.current = false;
    setScanState('idle');
    setSelectedFile(null);
    pendingReceiptIdRef.current = null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // ANDROID FIX: Clear localStorage on reset
    clearScanningStorage();
  };

  const handleCancel = () => {
    console.log('[ScanTab] User cancelled scan');
    const pendingReceiptId = pendingReceiptIdRef.current;
    const currentUserId = user?.id;

    resetScan();

    if (!pendingReceiptId || !currentUserId) {
      return;
    }

    void cleanupPendingReceipt(pendingReceiptId, currentUserId).catch((cleanupError) => {
      console.error('[ScanTab] Failed to clean up canceled receipt:', cleanupError);
      showToast('Failed to fully cancel receipt scan', 'error');
    });
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
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  onChange={handleFileSelect}
                  onClick={(e) => {
                    // Ensure we don't have stale values
                    const target = e.target as HTMLInputElement;
                    target.value = '';
                  }}
                  className="hidden"
                />

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      // ANDROID FIX: Save to localStorage BEFORE opening file picker
                      // This survives tab kill when Android opens camera
                      localStorage.setItem('isScanning', 'true');
                      localStorage.setItem('scanningSource', 'gallery');
                      fileInputRef.current?.click();
                    }}
                    className="w-full backdrop-blur-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <Upload className="w-5 h-5 text-teal-400" />
                      <span className="font-semibold text-white">Upload from Gallery</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      // ANDROID FIX: Save to localStorage BEFORE opening file picker
                      // This survives tab kill when Android opens camera
                      localStorage.setItem('isScanning', 'true');
                      localStorage.setItem('scanningSource', 'camera');

                      // Set capture attribute for camera
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute('capture', 'environment');
                      }
                      fileInputRef.current?.click();

                      // Remove capture after click to allow gallery next time
                      setTimeout(() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.removeAttribute('capture');
                        }
                      }, 100);
                    }}
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
                  {previewUrl && selectedFile && (
                    <div className="relative mb-6 rounded-xl overflow-hidden border border-white/10">
                      {selectedFile.type === 'application/pdf' ? (
                        <div className="flex flex-col items-center justify-center w-full h-64 bg-gradient-to-br from-white/10 to-white/5">
                          <File className="w-16 h-16 text-teal-400 mb-3" strokeWidth={1.5} />
                          <div className="text-center px-4">
                            <p className="text-sm text-teal-400 font-semibold mb-1">PDF Document</p>
                            <p className="text-xs text-gray-400 truncate">{selectedFile.name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {(selectedFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <img
                            src={previewUrl}
                            alt="Receipt preview"
                            className="w-full h-64 object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        </>
                      )}

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
                    {scanState === 'uploading' ? 'Uploading Receipt...' : 'Preparing your receipt...'}
                  </h2>
                  <p className="text-gray-400 mb-6">
                    {scanState === 'uploading'
                      ? 'Uploading your receipt to secure storage'
                      : 'Getting everything ready for scanning'
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
                    type="button"
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

                  <h2 className="text-2xl font-bold text-white mb-2">Receipt uploaded</h2>
                  <p className="text-gray-400 mb-6">We’re now scanning your receipt</p>

                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                    <p className="text-sm text-gray-400">
                      It will appear in your wallet once your details are ready.
                    </p>
                  </div>

                  <p className="text-sm text-green-400 font-semibold">
                    Taking you to your wallet...
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
                    type="button"
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
