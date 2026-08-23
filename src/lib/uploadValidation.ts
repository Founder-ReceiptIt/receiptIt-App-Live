export const MAX_RECEIPT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPT_PDF_PAGES = 20;
export const MAX_RECEIPT_IMAGE_PIXELS = 40_000_000;
export const MAX_RECEIPT_IMAGE_DIMENSION = 16_000;

export type ReceiptUploadKind = 'image' | 'pdf';

export type ReceiptUploadValidationResult =
  | { valid: true; kind: ReceiptUploadKind; dimensions?: { width: number; height: number } }
  | { valid: false; errorReason: string; message: string };

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_MAGIC = '%PDF-';
const PDF_EOF = '%%EOF';

// Keep this list exactly aligned with the private Storage bucket policy.  The
// browser normally reports JPEG files as image/jpeg; image/jpg is a
// non-standard alias which the bucket intentionally does not accept.
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const PDF_MIME_TYPE = 'application/pdf';
const EXTENSION_KIND: Record<string, ReceiptUploadKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  pdf: 'pdf',
};

const invalid = (errorReason: string, message: string): ReceiptUploadValidationResult => ({
  valid: false,
  errorReason,
  message,
});

const hasMagic = (bytes: Uint8Array, magic: number[]): boolean =>
  magic.every((value, index) => bytes[index] === value);

const getExtension = (fileName: string): string | null => {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 1 || lastDot === fileName.length - 1) return null;
  return fileName.slice(lastDot + 1).toLowerCase();
};

const getPdfPageCount = (pdfText: string): number => {
  const pageObjects = pdfText.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  if (pageObjects > 0) return pageObjects;

  const declaredCounts = Array.from(pdfText.matchAll(/\/Count\s+(\d+)/g))
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);

  return declaredCounts.length > 0 ? Math.max(...declaredCounts) : 0;
};

const getPngDimensions = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (bytes.length < 24 || !hasMagic(bytes, PNG_MAGIC)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const jpegSofMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const getJpegDimensions = (bytes: Uint8Array): { width: number; height: number } | null => {
  if (bytes.length < 4 || !hasMagic(bytes, JPEG_MAGIC)) return null;

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    // Standalone markers contain no segment length.
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (jpegSofMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }

    offset += segmentLength;
  }

  return null;
};

const isSafeImageDimensions = (dimensions: { width: number; height: number } | null): boolean => {
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) return false;
  if (dimensions.width > MAX_RECEIPT_IMAGE_DIMENSION || dimensions.height > MAX_RECEIPT_IMAGE_DIMENSION) return false;
  return dimensions.width * dimensions.height <= MAX_RECEIPT_IMAGE_PIXELS;
};

/**
 * Rejects files that cannot safely enter receipt processing before any Storage
 * write or paid AI work occurs. It intentionally performs only deterministic
 * format checks; visual quality is assessed by the processor after upload.
 */
export const validateReceiptUpload = async (file: File): Promise<ReceiptUploadValidationResult> => {
  if (file.size === 0) {
    return invalid('invalid_file', 'This file is empty. Choose a receipt image or PDF and try again.');
  }

  if (file.size > MAX_RECEIPT_UPLOAD_BYTES) {
    return invalid('file_too_large', 'This file is too large. The limit is 10MB.');
  }

  const extension = getExtension(file.name);
  const extensionKind = extension ? EXTENSION_KIND[extension] : undefined;
  const normalizedMime = file.type.toLowerCase();

  if (!extensionKind || (!IMAGE_MIME_TYPES.has(normalizedMime) && normalizedMime !== PDF_MIME_TYPE && normalizedMime !== '')) {
    return invalid('unsupported_file', 'This file type isn’t supported. Use a JPG, PNG or PDF.');
  }

  if (
    normalizedMime &&
    ((extensionKind === 'pdf' && normalizedMime !== PDF_MIME_TYPE) ||
      (extensionKind === 'image' && !IMAGE_MIME_TYPES.has(normalizedMime)))
  ) {
    return invalid('filename_type_mismatch', 'The file name and file type don’t match. Export it again and retry.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isJpeg = hasMagic(bytes, JPEG_MAGIC);
  const isPng = hasMagic(bytes, PNG_MAGIC);
  const firstBytes = new TextDecoder('latin1').decode(bytes.slice(0, 8));
  const isPdf = firstBytes.startsWith(PDF_MAGIC);

  if (extensionKind === 'image' && !isJpeg && !isPng) {
    return invalid('invalid_file', 'This file doesn’t look like a valid image. Choose a JPG or PNG receipt and try again.');
  }

  if (extensionKind === 'image') {
    const dimensions = isPng ? getPngDimensions(bytes) : getJpegDimensions(bytes);
    if (!isSafeImageDimensions(dimensions)) {
      return invalid('image_dimension_limit', 'This image is too large to process safely. Use a smaller receipt image and try again.');
    }

    return { valid: true, kind: extensionKind, dimensions: dimensions || undefined };
  }

  if (extensionKind === 'pdf' && !isPdf) {
    return invalid('invalid_pdf', 'This file doesn’t look like a valid PDF. Export it again and retry.');
  }

  if (extensionKind === 'pdf') {
    const pdfText = new TextDecoder('latin1').decode(bytes);
    const tail = pdfText.slice(-2048);

    if (/\/Encrypt\b/.test(pdfText)) {
      return invalid('encrypted_pdf', 'This PDF is password-protected. Remove the password and upload it again.');
    }

    if (!tail.includes(PDF_EOF)) {
      return invalid('malformed_pdf', 'This PDF appears incomplete or damaged. Export it again and retry.');
    }

    const pageCount = getPdfPageCount(pdfText);
    if (pageCount === 0) {
      return invalid('malformed_pdf', 'This PDF could not be read safely. Export it again and retry.');
    }

    if (pageCount > MAX_RECEIPT_PDF_PAGES) {
      return invalid('pdf_page_limit', `This PDF has too many pages. Upload up to ${MAX_RECEIPT_PDF_PAGES} pages.`);
    }
  }

  return { valid: true, kind: extensionKind };
};
