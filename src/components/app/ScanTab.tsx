import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Camera, CheckCircle, Loader2, FileImage, File, Clock } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  MAX_RECEIPT_IMAGE_DIMENSION,
  MAX_RECEIPT_IMAGE_PIXELS,
  MAX_RECEIPT_UPLOAD_BYTES,
  validateReceiptUpload,
  type ReceiptUploadKind,
} from '../../lib/uploadValidation';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { consumeReceiptSectionCaptureRequest } from '../../lib/receiptCaptureUtils';
import { getReceiptFailureDetails } from '../../lib/receiptUiUtils';

type ScanState = 'idle' | 'review' | 'uploading' | 'processing' | 'pending' | 'success' | 'error';

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

const MAX_MULTI_RECEIPT_IMAGES = 10;
const MAX_MULTI_RECEIPT_TOTAL_BYTES = 30 * 1024 * 1024;
const MAX_MULTI_RECEIPT_SOURCE_PIXELS = 20_000_000;
const MULTI_IMAGE_GAP = 18;

type ReceiptPickerMode = 'camera' | 'files';

const isPdfSelection = (file: File): boolean => (
  file.type.toLowerCase() === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
);

const toHashHex = (hashBuffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

const computeMultiImageHash = async (files: File[]): Promise<string> => {
  const encoder = new TextEncoder();
  const headers = [encoder.encode(`receiptit-multi-image-v1:${files.length}\n`)];
  const imageBytes = await Promise.all(files.map((file, index) => file.arrayBuffer().then((buffer) => ({
    index,
    bytes: new Uint8Array(buffer),
  }))));
  const totalLength = headers.reduce((total, value) => total + value.byteLength, 0)
    + imageBytes.reduce((total, { index, bytes }) => total + encoder.encode(`${index}:${bytes.byteLength}\n`).byteLength + bytes.byteLength, 0);
  const payload = new Uint8Array(totalLength);
  let offset = 0;

  headers.forEach((header) => {
    payload.set(header, offset);
    offset += header.byteLength;
  });
  imageBytes.forEach(({ index, bytes }) => {
    const header = encoder.encode(`${index}:${bytes.byteLength}\n`);
    payload.set(header, offset);
    offset += header.byteLength;
    payload.set(bytes, offset);
    offset += bytes.byteLength;
  });

  return toHashHex(await crypto.subtle.digest('SHA-256', payload));
};

const loadReceiptImage = async (file: File): Promise<HTMLImageElement> => {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('One of these images could not be opened.'));
      image.src = imageUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

const canvasToJpeg = (images: HTMLImageElement[], scale: number, quality: number): Promise<Blob> => {
  const sourceWidth = Math.max(...images.map((image) => image.naturalWidth));
  const sourceHeight = images.reduce((total, image) => total + image.naturalHeight, MULTI_IMAGE_GAP * (images.length - 1));
  const width = Math.max(1, Math.floor(sourceWidth * scale));
  const height = Math.max(1, Math.floor(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) throw new Error('Your browser could not prepare these images.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  let y = 0;
  images.forEach((image) => {
    const imageWidth = Math.floor(image.naturalWidth * scale);
    const imageHeight = Math.floor(image.naturalHeight * scale);
    context.drawImage(image, Math.floor((width - imageWidth) / 2), y, imageWidth, imageHeight);
    y += imageHeight + Math.floor(MULTI_IMAGE_GAP * scale);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Your browser could not prepare these images.'));
    }, 'image/jpeg', quality);
  });
};

const combineReceiptImages = async (files: File[]): Promise<File> => {
  const images = await Promise.all(files.map(loadReceiptImage));
  const sourceWidth = Math.max(...images.map((image) => image.naturalWidth));
  const sourceHeight = images.reduce((total, image) => total + image.naturalHeight, MULTI_IMAGE_GAP * (images.length - 1));
  const baseScale = Math.min(
    1,
    MAX_RECEIPT_IMAGE_DIMENSION / sourceWidth,
    MAX_RECEIPT_IMAGE_DIMENSION / sourceHeight,
    Math.sqrt(MAX_RECEIPT_IMAGE_PIXELS / (sourceWidth * sourceHeight)),
  );

  for (const sizeScale of [1, 0.86, 0.72, 0.58]) {
    for (const quality of [0.92, 0.84, 0.76]) {
      const blob = await canvasToJpeg(images, baseScale * sizeScale, quality);
      if (blob.size <= MAX_RECEIPT_UPLOAD_BYTES) {
        return new window.File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      }
    }
  }

  throw new Error('These images are too detailed to combine safely. Choose clearer or smaller images and try again.');
};

export function ScanTab({ onNavigateToWallet }: ScanTabProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const [isCombiningImages, setIsCombiningImages] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorTitle, setErrorTitle] = useState<string>('Couldn’t add receipt');
  const [failedReceiptSaved, setFailedReceiptSaved] = useState(false);
  const [sectionCaptureMode, setSectionCaptureMode] = useState(() => consumeReceiptSectionCaptureRequest());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerModeRef = useRef<ReceiptPickerMode>('files');
  const isScanningRef = useRef(false);
  const restoredPickerRef = useRef(false);
  const activeScanTokenRef = useRef(0);
  const pendingReceiptIdRef = useRef<string | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusFallbackTimeoutRef = useRef<number | null>(null);

  const clearScanningStorage = () => {
    localStorage.removeItem('isScanning');
    localStorage.removeItem('scanningSource');
  };

  const cleanupReceiptStatusWatcher = () => {
    if (statusFallbackTimeoutRef.current !== null) {
      window.clearTimeout(statusFallbackTimeoutRef.current);
      statusFallbackTimeoutRef.current = null;
    }

    if (statusChannelRef.current) {
      supabase.removeChannel(statusChannelRef.current);
      statusChannelRef.current = null;
    }
  };

  const resolveScanSuccess = (scanToken: number) => {
    if (!isScanActive(scanToken)) {
      return;
    }

    cleanupReceiptStatusWatcher();
    setErrorMessage('');
    setScanState('success');
    clearScanningStorage();
    isScanningRef.current = false;

    window.setTimeout(() => {
      if (!isScanActive(scanToken)) return;

      resetScan();
      onNavigateToWallet();
    }, 1500);
  };

  const resolveScanPending = (scanToken: number) => {
    if (!isScanActive(scanToken)) {
      return;
    }

    cleanupReceiptStatusWatcher();
    clearScanningStorage();
    isScanningRef.current = false;
    setScanState('pending');
  };

  const isScanActive = (scanToken: number) => activeScanTokenRef.current === scanToken;

  const removeUploadedReceiptFile = async (storagePath: string) => {
    const { error } = await supabase.storage.from('receipts').remove([storagePath]);

    if (error) {
      throw error;
    }
  };

  const cleanupPendingReceipt = async (receiptId: string, userId: string) => {
    const { data: scopedReceipt, error: scopedReceiptError } = await supabase
      .from('receipts')
      .select('id, storage_path')
      .eq('id', receiptId)
      .eq('user_id', userId)
      .maybeSingle();

    if (scopedReceiptError) {
      throw scopedReceiptError;
    }

    if (!scopedReceipt) {
      return;
    }

    // Receipt child records are processor-managed. Deleting the owned parent
    // uses the database's foreign-key cascade, so a browser never needs write
    // access to item or payment rows.
    const { error: receiptDeleteError } = await supabase
      .from('receipts')
      .delete()
      .eq('id', receiptId)
      .eq('user_id', userId);

    if (receiptDeleteError) {
      throw receiptDeleteError;
    }

    if (scopedReceipt.storage_path) {
      await removeUploadedReceiptFile(scopedReceipt.storage_path);
    }
  };

  // ANDROID FIX: Restore scanning state after page reload (Android kills tab when camera opens)
  useEffect(() => {
    const isScanning = localStorage.getItem('isScanning');
    if (isScanning === 'true') {
      console.log('[ScanTab] Restored scanning state from localStorage after reload');
      // Show waiting state - the file picker should still deliver the file
      setScanState('uploading');
      // Do not mark the scanner as actively uploading: some Android browsers
      // deliver the selected file after restoring the tab. Blocking it here
      // turns a valid file into a false "camera closed" error.
      restoredPickerRef.current = true;
      isScanningRef.current = false;

      // ANDROID SAFETY: If no file arrives within 10 seconds, assume Android lost it
      const timeout = setTimeout(() => {
        console.log('[ScanTab] No file received after reload - Android likely lost the file');
        setErrorMessage('Your camera closed before a photo was added. Try again when you’re ready.');
        setScanState('error');
        restoredPickerRef.current = false;
        isScanningRef.current = false;
        clearScanningStorage();
      }, 10000);

      // Clean up timeout if component unmounts
      return () => clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupReceiptStatusWatcher();
    };
  }, []);

  const showSelectionError = (message: string) => {
    setErrorTitle('Couldn’t add receipt');
    setErrorMessage(message);
    setFailedReceiptSaved(false);
    setScanState('error');
    isScanningRef.current = false;
    showToast(message, undefined);
  };

  const prepareImageSelection = async (files: File[]): Promise<boolean> => {
    if (files.length > MAX_MULTI_RECEIPT_IMAGES) {
      showSelectionError(`Choose up to ${MAX_MULTI_RECEIPT_IMAGES} images for one receipt.`);
      return false;
    }

    if (files.reduce((total, selectedImage) => total + selectedImage.size, 0) > MAX_MULTI_RECEIPT_TOTAL_BYTES) {
      showSelectionError('These images are too large together. Choose up to 30MB in total.');
      return false;
    }

    const validations = await Promise.all(files.map((selectedImage) => validateReceiptUpload(selectedImage)));
    const invalidValidation = validations.find((validation) => !validation.valid);
    if (invalidValidation && !invalidValidation.valid) {
      console.warn('[ScanTab] Multi-image upload rejected before processing:', invalidValidation.errorReason);
      showSelectionError(invalidValidation.message);
      return false;
    }

    if (validations.some((validation) => validation.valid && validation.kind !== 'image')) {
      showSelectionError('Upload one PDF at a time.');
      return false;
    }

    const sourcePixels = validations.reduce((total, validation) => {
      if (!validation.valid || !validation.dimensions) return total;
      return total + validation.dimensions.width * validation.dimensions.height;
    }, 0);
    if (sourcePixels > MAX_MULTI_RECEIPT_SOURCE_PIXELS) {
      showSelectionError('These images are too high-resolution together. Choose clearer or smaller images and try again.');
      return false;
    }

    return true;
  };

  const openCameraPicker = () => {
    pickerModeRef.current = 'camera';
    localStorage.setItem('isScanning', 'true');
    localStorage.setItem('scanningSource', 'camera');

    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('multiple');
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
    }

    window.setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.setAttribute('multiple', '');
      }
    }, 100);
  };

  const openFilePicker = () => {
    pickerModeRef.current = 'files';
    clearScanningStorage();
    fileInputRef.current?.removeAttribute('capture');
    fileInputRef.current?.setAttribute('multiple', '');
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // CRITICAL: Prevent any default browser behavior
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.target.files || []);
    const file = files[0];
    const pickerMode: ReceiptPickerMode = localStorage.getItem('scanningSource') === 'camera'
      ? 'camera'
      : pickerModeRef.current;
    if (!file || (isScanningRef.current && !restoredPickerRef.current)) {
      console.log('[ScanTab] File selection blocked - already scanning or no file');
      // Clear localStorage if no file selected (user cancelled)
      clearScanningStorage();
      return;
    }

    console.log('[ScanTab] File selected:', file.name, file.type, file.size, 'count:', files.length);
    restoredPickerRef.current = false;
    clearScanningStorage();

    // Reset the input immediately to prevent re-triggering
    e.target.value = '';

    // Block a second selection while deterministic file validation is running.
    isScanningRef.current = true;

    if (pickerMode === 'camera') {
      const nextImages = [...selectedImageFiles, file];
      if (!(await prepareImageSelection(nextImages))) return;

      flushSync(() => {
        setSelectedImageFiles(nextImages);
        setSelectedFile(null);
        setPreviewUrl(null);
        setErrorMessage('');
        setErrorTitle('Couldn’t add receipt');
        setFailedReceiptSaved(false);
        setScanState('review');
      });
      isScanningRef.current = false;
      return;
    }

    if (files.length > 1 && files.some(isPdfSelection)) {
      showSelectionError('Upload one PDF at a time.');
      return;
    }

    if (files.length > 1) {
      if (!(await prepareImageSelection(files))) return;

      flushSync(() => {
        setSelectedImageFiles(files);
        setSelectedFile(null);
        setPreviewUrl(null);
        setErrorMessage('');
        setErrorTitle('Couldn’t add receipt');
        setFailedReceiptSaved(false);
        setScanState('review');
      });
      isScanningRef.current = false;
      return;
    }

    const validation = await validateReceiptUpload(file);
    if (!validation.valid) {
      console.warn('[ScanTab] Upload rejected before processing:', validation.errorReason);
      setErrorMessage(validation.message);
      setScanState('error');
      isScanningRef.current = false;
      clearScanningStorage();
      showToast(validation.message, undefined);
      return;
    }

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
      void startScan(file, validation.kind, scanToken);
    }, 0);
  };

  const handleContinueMultiImageReceipt = async () => {
    if (selectedImageFiles.length < 1) {
      return;
    }

    const scanToken = activeScanTokenRef.current + 1;
    activeScanTokenRef.current = scanToken;
    pendingReceiptIdRef.current = null;
    isScanningRef.current = true;
    setErrorMessage('');
    setErrorTitle('Couldn’t add receipt');
    setFailedReceiptSaved(false);
    setScanState('uploading');

    if (selectedImageFiles.length === 1) {
      const singleImage = selectedImageFiles[0];
      setSelectedFile(singleImage);
      setPreviewUrl(URL.createObjectURL(singleImage));
      window.setTimeout(() => void startScan(singleImage, 'image', scanToken), 0);
      return;
    }

    setIsCombiningImages(true);

    try {
      const [fileHash, combinedFile] = await Promise.all([
        computeMultiImageHash(selectedImageFiles),
        combineReceiptImages(selectedImageFiles),
      ]);

      if (!isScanActive(scanToken)) {
        return;
      }

      const validation = await validateReceiptUpload(combinedFile);
      if (!validation.valid || validation.kind !== 'image') {
        throw new Error(!validation.valid ? validation.message : 'These images could not be prepared as a receipt.');
      }

      const imageUrl = URL.createObjectURL(combinedFile);
      setSelectedFile(combinedFile);
      setPreviewUrl(imageUrl);
      setIsCombiningImages(false);
      await startScan(combinedFile, 'image', scanToken, fileHash);
    } catch (error) {
      console.error('[ScanTab] Could not combine receipt images:', error);
      if (isScanActive(scanToken)) {
        setErrorMessage(error instanceof Error ? error.message : 'We couldn’t prepare these images. Please try again.');
        setScanState('error');
        setIsCombiningImages(false);
        isScanningRef.current = false;
      }
    }
  };

  const startScan = async (file: File, uploadKind: ReceiptUploadKind, scanToken: number, precomputedFileHash?: string) => {
    if (!isScanActive(scanToken)) {
      return;
    }

    if (!user) {
      if (isScanActive(scanToken)) {
        setErrorMessage('Your session has expired. Please sign in and try again.');
        setScanState('error');
        clearScanningStorage();
      }
      return;
    }

    // State is already set to 'uploading' in handleFileSelect for immediate feedback
    console.log('[ScanTab] Starting upload to storage...');

    try {
      // Start hashing immediately. The hash gives us an exact, privacy-safe
      // fingerprint of this file, so we can stop an accidental re-upload
      // before it creates another storage object or another processing job.
      const fileHashPromise = precomputedFileHash ? Promise.resolve(precomputedFileHash) : computeFileHash(file);

      let fileHash: string | undefined;
      try {
        fileHash = await fileHashPromise;
      } catch (hashErr) {
        // Hashing is an integrity improvement, not a reason to lose a valid
        // receipt. The database trigger remains the final guard when a hash
        // is available on a later retry.
        console.error('[ScanTab] Failed to compute file hash:', hashErr);
      }

      if (!isScanActive(scanToken)) {
        return;
      }

      if (fileHash) {
        const { data: existingReceipts, error: existingReceiptError } = await supabase
          .from('receipts')
          .select('id, status, merchant')
          .eq('user_id', user.id)
          .eq('file_hash', fileHash)
          .in('status', ['processing', 'parsed', 'completed', 'needs_review', 'needs_input', 'duplicate'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (existingReceiptError) {
          // Do not stop a valid upload merely because the optional early
          // duplicate check was unavailable. The server-side trigger protects
          // the insert against a simultaneous upload.
          console.warn('[ScanTab] Could not check for an existing file:', existingReceiptError);
        } else if (existingReceipts?.[0]) {
          const existingReceipt = existingReceipts[0];
          const isStillProcessing = existingReceipt.status === 'processing';

          console.info('[ScanTab] Exact duplicate selected; opening existing receipt:', existingReceipt.id);
          showToast(
            isStillProcessing ? 'Receipt is already processing' : 'Receipt already saved',
            isStillProcessing
              ? 'We are already reading this exact file. You can follow its progress in your Wallet.'
              : 'This exact file is already in your Wallet.'
          );

          isScanningRef.current = false;
          clearScanningStorage();
          resetScan();
          onNavigateToWallet();
          return;
        }
      }

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
          setErrorMessage('We couldn’t upload this file. Please try again.');
          setScanState('error');
          clearScanningStorage();
        }
        return;
      }

      if (!isScanActive(scanToken)) {
        return;
      }

      const storagePath = uploadData.path;

      if (isScanActive(scanToken)) {
        setScanState('processing');
      }

      try {
        const referenceNumber = `REF-${timestamp}`;

        const { data: insertData, error: insertError } = await supabase
          .from('receipts')
          .insert({
            user_id: user.id,
            // Keep the original submission type accurate for processing,
            // analytics, and any later re-processing of the file.
            source: uploadKind,
            storage_path: storagePath,
            // Keep a storage path rather than a public object URL. The viewer
            // resolves a short-lived signed URL only when the owner requests it.
            image_url: storagePath,
            // Persist the file hash for exact duplicate detection when available
            ...(fileHash ? { file_hash: fileHash } : {}),
            status: 'processing',
            processing_attempt_started_at: new Date().toISOString(),
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
          try {
            await removeUploadedReceiptFile(storagePath);
          } catch (cleanupError) {
            console.error('[ScanTab] Failed to remove uploaded file after record creation failed:', cleanupError);
          }
          if (isScanActive(scanToken)) {
            setErrorMessage('We couldn’t start processing this file. Please try again.');
            setScanState('error');
            clearScanningStorage();
          }
          throw insertError;
        }

        if (!insertData || insertData.length === 0) {
          try {
            await removeUploadedReceiptFile(storagePath);
          } catch (cleanupError) {
            console.error('[ScanTab] Failed to remove uploaded file after record verification failed:', cleanupError);
          }
          if (isScanActive(scanToken)) {
            setErrorMessage('We couldn’t start processing this file. Please try again.');
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

        const receiptStatusChannel = supabase
          .channel(`receipt-status-${receiptId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'receipts',
              filter: `id=eq.${receiptId}`,
            },
            (payload) => {
              const updatedStatus = payload.new?.status as string | undefined;

              if (!updatedStatus || !isScanActive(scanToken)) {
                return;
              }

              if (updatedStatus === 'completed' || updatedStatus === 'parsed') {
                console.log('[ScanTab] Receipt status resolved to success:', updatedStatus);
                resolveScanSuccess(scanToken);
                return;
              }

              if (updatedStatus === 'failed' || updatedStatus === 'error' || updatedStatus === 'needs_input' || updatedStatus === 'needs_review' || updatedStatus === 'rejected') {
                console.log('[ScanTab] Receipt status resolved to error:', updatedStatus);
                cleanupReceiptStatusWatcher();
                const failureDetails = getReceiptFailureDetails({
                  status: updatedStatus,
                  errorReason: payload.new?.error_reason,
                  createdAt: payload.new?.created_at,
                  processingAttemptStartedAt: payload.new?.processing_attempt_started_at,
                });
                setErrorTitle(failureDetails?.title || 'Couldn’t process receipt');
                setErrorMessage(
                  failureDetails
                    ? [failureDetails.reason, failureDetails.advice].filter(Boolean).join(' ')
                    : 'We couldn’t read enough of this receipt. Try again from your Wallet.'
                );
                setFailedReceiptSaved(true);
                setScanState('error');
                isScanningRef.current = false;
                clearScanningStorage();
              }
            }
          )
          .subscribe();

        statusChannelRef.current = receiptStatusChannel;

        statusFallbackTimeoutRef.current = window.setTimeout(() => {
          if (!isScanActive(scanToken)) {
            return;
          }

          console.log('[ScanTab] Receipt status has not resolved after 30 seconds. Keeping it visible as pending.');
          resolveScanPending(scanToken);
        }, 30000);
      } catch (err) {
        console.error('Scan error:', err);
        throw err;
      }

      if (!isScanActive(scanToken)) {
        return;
      }
    } catch (error) {
      console.error('[ScanTab] Error during scan:', error);
      if (isScanActive(scanToken)) {
        setErrorMessage('We couldn’t process this file. Please try again.');
        setErrorTitle('Couldn’t add receipt');
        setFailedReceiptSaved(Boolean(pendingReceiptIdRef.current));
        setScanState('error');
        isScanningRef.current = false;
        // ANDROID FIX: Clear localStorage on error
        clearScanningStorage();
      }
    }
  };

  const resetScan = () => {
    console.log('[ScanTab] Resetting scan state');
    cleanupReceiptStatusWatcher();
    activeScanTokenRef.current += 1;
    isScanningRef.current = false;
    setScanState('idle');
    setSelectedFile(null);
    setSelectedImageFiles([]);
    setIsCombiningImages(false);
    setSectionCaptureMode(false);
    setErrorTitle('Couldn’t add receipt');
    setFailedReceiptSaved(false);
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

    cleanupReceiptStatusWatcher();
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
    <div className="min-h-screen max-w-7xl px-6 pb-32 pt-8 mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white">Add receipt</h1>
      </motion.div>

      <div className="mx-auto w-full max-w-md">
        <div className="w-full">
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
                <div className="mb-5 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-teal-400/25 bg-teal-400/10"><Camera className="w-7 h-7 text-teal-300" strokeWidth={1.5} /></div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  multiple
                  onChange={handleFileSelect}
                  onClick={(e) => {
                    // Ensure we don't have stale values
                    const target = e.target as HTMLInputElement;
                    target.value = '';
                  }}
                  className="hidden"
                />

                {/* TODO native: guided receipt capture with edge detection, blur checks and lighting checks. */}

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); openCameraPicker(); }}
                    className="w-full backdrop-blur-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <Camera className="w-5 h-5 text-teal-400" />
                      <span className="font-semibold text-white">Scan receipt</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      // Gallery selection is not a camera capture and should
                      // never trigger Android's camera-recovery path.
                      openFilePicker();
                    }}
                    className="w-full backdrop-blur-xl bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <Upload className="w-5 h-5 text-white" />
                      <span className="font-semibold text-white">Upload from device</span>
                    </div>
                  </button>
                </div>

                <div className="mt-5 text-center">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {sectionCaptureMode
                      ? 'Scan each section in order, starting at the top.'
                      : 'For the clearest result, keep the receipt flat and well lit.'}
                  </p>
                </div>

              </motion.div>
            )}

            {scanState === 'review' && (
              <motion.div
                key="review"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-teal-400/25 bg-teal-400/10"><FileImage className="h-7 w-7 text-teal-300" strokeWidth={1.5} /></div>
                  <h2 className="mt-4 text-2xl font-bold text-white">
                    {selectedImageFiles.length} {selectedImageFiles.length === 1 ? 'image' : 'images'} selected
                  </h2>
                  <p className="mt-2 text-sm text-gray-300">We’ll read them together as one receipt.</p>
                  <div className="mt-5 flex justify-center gap-2" aria-label={`${selectedImageFiles.length} images in selection order`}>
                    {selectedImageFiles.map((file, index) => <span key={`${file.name}-${file.lastModified}-${index}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-teal-300/20 bg-teal-400/10 text-xs font-bold text-teal-100">{index + 1}</span>)}
                  </div>
                  <div className="mt-7 space-y-3">
                    <button type="button" onClick={openCameraPicker} className="w-full rounded-xl border border-white/10 bg-white/5 p-4 font-semibold text-white transition-all duration-300 hover:bg-white/10">
                      <span className="inline-flex items-center justify-center gap-2"><Camera className="h-4 w-4" />Add another image</span>
                    </button>
                    <button type="button" onClick={() => void handleContinueMultiImageReceipt()} className="w-full rounded-xl border border-teal-400/30 bg-teal-500/20 p-4 font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-teal-500/30 active:scale-[0.98]">Continue</button>
                    <button type="button" onClick={resetScan} className="w-full rounded-xl border border-white/10 bg-white/5 p-4 font-semibold text-gray-300 transition-all duration-300 hover:bg-white/10">Choose again</button>
                  </div>
                </div>
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
                    {isCombiningImages ? 'Putting your receipt together...' : scanState === 'uploading' ? 'Uploading Receipt...' : 'Preparing your receipt...'}
                  </h2>
                  <p className="text-gray-400 mb-6">
                    {isCombiningImages
                      ? 'Keeping your selected images together in one receipt'
                      : scanState === 'uploading'
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
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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

            {scanState === 'pending' && (
              <motion.div
                key="pending"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="backdrop-blur-xl bg-white/5 border border-amber-400/20 rounded-2xl p-8"
              >
                <div className="text-center">
                  <Clock className="w-20 h-20 text-amber-300 mx-auto mb-4" strokeWidth={1.5} />
                  <h2 className="text-2xl font-bold text-white mb-2">Receipt is still processing</h2>
                  <p className="text-gray-400 mb-6">
                    Your receipt was safely uploaded. It is taking longer than usual, so you can check its live status in your Wallet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      resetScan();
                      onNavigateToWallet();
                    }}
                    className="w-full backdrop-blur-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 rounded-xl py-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="font-semibold text-teal-400">View Wallet</span>
                  </button>
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

                  <h2 className="text-2xl font-bold text-white mb-2">{errorTitle}</h2>
                  <p className="text-gray-400 mb-6">{errorMessage || 'We couldn’t add this receipt. Try again when you’re ready.'}</p>

                  {failedReceiptSaved ? (
                    <>
                      <p className="mb-4 text-sm text-gray-500">This receipt is saved in your Wallet, where you can try again or review the original.</p>
                      <button
                        type="button"
                        onClick={() => { resetScan(); onNavigateToWallet(); }}
                        className="w-full backdrop-blur-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 rounded-xl py-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <span className="font-semibold text-teal-400">View in Wallet</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={resetScan}
                      className="w-full backdrop-blur-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/30 rounded-xl py-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span className="font-semibold text-teal-400">Try again</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
