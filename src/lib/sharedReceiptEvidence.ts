import {
  MAX_RECEIPT_IMAGE_DIMENSION,
  MAX_RECEIPT_IMAGE_PIXELS,
  MAX_RECEIPT_UPLOAD_BYTES,
} from './uploadValidation';

const WEBP_HEADER_LENGTH = 12;
const TEXT_EVIDENCE_MAX_LENGTH = 12_000;
const TEXT_EVIDENCE_WIDTH = 1080;
const TEXT_EVIDENCE_PADDING = 64;
const TEXT_EVIDENCE_LINE_HEIGHT = 42;
const TEXT_EVIDENCE_FONT = '28px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const decodeImage = async (file: File): Promise<HTMLImageElement> => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This shared image could not be opened.'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> => (
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('This shared receipt could not be prepared.'));
    }, type, quality);
  })
);

const hasWebpMagic = async (file: File): Promise<boolean> => {
  const bytes = new Uint8Array(await file.slice(0, WEBP_HEADER_LENGTH).arrayBuffer());
  if (bytes.length < WEBP_HEADER_LENGTH) return false;
  return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
};

export const normaliseSharedImageFile = async (file: File): Promise<File> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isWebp = file.type.toLowerCase() === 'image/webp' || extension === 'webp';
  if (!isWebp) return file;

  if (file.size === 0 || file.size > MAX_RECEIPT_UPLOAD_BYTES || !(await hasWebpMagic(file))) {
    throw new Error('This shared WebP image could not be read safely. Save it as a JPG or PNG and try again.');
  }

  const image = await decodeImage(file);
  const sourcePixels = image.naturalWidth * image.naturalHeight;
  if (
    image.naturalWidth < 1
    || image.naturalHeight < 1
    || image.naturalWidth > MAX_RECEIPT_IMAGE_DIMENSION
    || image.naturalHeight > MAX_RECEIPT_IMAGE_DIMENSION
    || sourcePixels > MAX_RECEIPT_IMAGE_PIXELS
  ) {
    throw new Error('This shared image is too large to process safely. Use a smaller receipt image and try again.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This shared image could not be prepared.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const converted = await canvasToBlob(canvas, 'image/jpeg', 0.95);
  if (converted.size > MAX_RECEIPT_UPLOAD_BYTES) {
    throw new Error('This shared WebP image is too large after conversion. Save a smaller JPG or PNG and try again.');
  }

  return new File([converted], 'shared-receipt.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
};

const wrapText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const output: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph.trim()) {
      output.push('');
      continue;
    }

    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (context.measureText(word).width > maxWidth) {
        if (line) {
          output.push(line);
          line = '';
        }
        let fragment = '';
        for (const character of word) {
          if (context.measureText(fragment + character).width > maxWidth && fragment) {
            output.push(fragment);
            fragment = character;
          } else {
            fragment += character;
          }
        }
        line = fragment;
        continue;
      }

      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width > maxWidth && line) {
        output.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) output.push(line);
  }
  return output;
};

export const isLikelyPurchaseText = (value: string): boolean => {
  const text = value.toLowerCase();
  const hasPurchaseSignal = /\b(receipt|invoice|order|booking|purchase|paid|payment|charged|transaction|total|subtotal|vat|tax|card|delivery|merchant|store|shop)\b/.test(text);
  const hasAmount = /(?:£|\$|€|¥|\b(?:gbp|usd|eur|aud|cad|nzd|jpy)\b)\s*\d{1,9}(?:[.,]\d{1,2})?/i.test(value);
  const hasReference = /\b(?:order|invoice|receipt|reference|booking|transaction)\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*[a-z0-9-]{3,}\b/i.test(value);
  return hasPurchaseSignal && (hasAmount || hasReference);
};

export const createSharedTextEvidenceFile = async (rawText: string): Promise<File> => {
  const text = rawText.trim();
  if (!text || text.length > TEXT_EVIDENCE_MAX_LENGTH) {
    throw new Error(text ? 'This shared message is too long to add safely.' : 'There was no purchase information to add.');
  }

  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');
  if (!measuringContext) throw new Error('This shared message could not be prepared.');
  measuringContext.font = TEXT_EVIDENCE_FONT;

  const lines = wrapText(measuringContext, text, TEXT_EVIDENCE_WIDTH - (TEXT_EVIDENCE_PADDING * 2));
  const height = Math.max(400, (TEXT_EVIDENCE_PADDING * 2) + (lines.length * TEXT_EVIDENCE_LINE_HEIGHT));
  if (height > MAX_RECEIPT_IMAGE_DIMENSION || height * TEXT_EVIDENCE_WIDTH > MAX_RECEIPT_IMAGE_PIXELS) {
    throw new Error('This shared message is too long to add safely.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = TEXT_EVIDENCE_WIDTH;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This shared message could not be prepared.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111827';
  context.font = TEXT_EVIDENCE_FONT;
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, TEXT_EVIDENCE_PADDING, TEXT_EVIDENCE_PADDING + (index * TEXT_EVIDENCE_LINE_HEIGHT)));

  const blob = await canvasToBlob(canvas, 'image/png');
  if (blob.size > MAX_RECEIPT_UPLOAD_BYTES) {
    throw new Error('This shared message is too large to add safely.');
  }

  return new File([blob], 'shared-purchase-message.png', { type: 'image/png', lastModified: 0 });
};

export const computeSharedTextHash = async (rawText: string): Promise<string> => {
  const payload = new TextEncoder().encode(`receiptit-shared-text-v1\n${rawText.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
