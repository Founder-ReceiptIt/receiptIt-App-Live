export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const isInBounds = (bytes: Uint8Array, offset: number, length = 1) => (
  offset >= 0 && length >= 0 && offset + length <= bytes.byteLength
);

/**
 * Reads the TIFF orientation tag from a JPEG APP1/EXIF segment. Invalid or
 * missing metadata deliberately falls back to orientation 1.
 */
export const readJpegExifOrientation = (bytes: Uint8Array): ExifOrientation => {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (isInBounds(bytes, offset, 4)) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (!isInBounds(bytes, offset, 2)) break;

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || !isInBounds(bytes, offset, segmentLength)) break;

    if (marker === 0xe1 && segmentLength >= 14) {
      const exifStart = offset + 2;
      const hasExifHeader = isInBounds(bytes, exifStart, 6)
        && bytes[exifStart] === 0x45
        && bytes[exifStart + 1] === 0x78
        && bytes[exifStart + 2] === 0x69
        && bytes[exifStart + 3] === 0x66
        && bytes[exifStart + 4] === 0
        && bytes[exifStart + 5] === 0;

      if (hasExifHeader) {
        const tiffStart = exifStart + 6;
        if (!isInBounds(bytes, tiffStart, 8)) return 1;

        const byteOrder = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
        const littleEndian = byteOrder === "II";
        if (!littleEndian && byteOrder !== "MM") return 1;
        if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return 1;

        const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
        const ifdStart = tiffStart + firstIfdOffset;
        if (!isInBounds(bytes, ifdStart, 2)) return 1;

        const entryCount = view.getUint16(ifdStart, littleEndian);
        for (let index = 0; index < entryCount; index += 1) {
          const entryOffset = ifdStart + 2 + (index * 12);
          if (!isInBounds(bytes, entryOffset, 12)) return 1;
          if (view.getUint16(entryOffset, littleEndian) !== 0x0112) continue;

          const orientation = view.getUint16(entryOffset + 8, littleEndian);
          return orientation >= 1 && orientation <= 8 ? orientation as ExifOrientation : 1;
        }
      }
    }

    offset += segmentLength;
  }

  return 1;
};

export interface ProofImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

/**
 * Returns PDF drawing geometry for the common EXIF rotation values. Width and
 * height may be negative for mirrored EXIF variants, which preserves the
 * camera's intended visual orientation without changing the stored original.
 */
export const getProofImagePlacement = ({
  sourceWidth,
  sourceHeight,
  orientation,
  pageWidth,
  pageHeight,
  maxWidth,
  maxHeight,
}: {
  sourceWidth: number;
  sourceHeight: number;
  orientation: ExifOrientation;
  pageWidth: number;
  pageHeight: number;
  maxWidth: number;
  maxHeight: number;
}): ProofImagePlacement => {
  const swapsAxes = [5, 6, 7, 8].includes(orientation);
  const orientedWidth = swapsAxes ? sourceHeight : sourceWidth;
  const orientedHeight = swapsAxes ? sourceWidth : sourceHeight;
  const scale = Math.min(maxWidth / orientedWidth, maxHeight / orientedHeight);
  const displayWidth = orientedWidth * scale;
  const displayHeight = orientedHeight * scale;
  const targetX = (pageWidth - displayWidth) / 2;
  const targetY = (pageHeight - displayHeight) / 2;

  switch (orientation) {
    case 2:
      return { x: targetX + displayWidth, y: targetY, width: -displayWidth, height: displayHeight, rotation: 0 };
    case 3:
      return { x: targetX + displayWidth, y: targetY + displayHeight, width: displayWidth, height: displayHeight, rotation: 180 };
    case 4:
      return { x: targetX, y: targetY + displayHeight, width: displayWidth, height: -displayHeight, rotation: 0 };
    case 5:
      return { x: targetX + displayWidth, y: targetY, width: -displayHeight, height: displayWidth, rotation: 90 };
    case 6:
      return { x: targetX, y: targetY + displayHeight, width: displayHeight, height: displayWidth, rotation: 270 };
    case 7:
      return { x: targetX, y: targetY + displayHeight, width: displayHeight, height: -displayWidth, rotation: 270 };
    case 8:
      return { x: targetX + displayWidth, y: targetY, width: displayHeight, height: displayWidth, rotation: 90 };
    default:
      return { x: targetX, y: targetY, width: displayWidth, height: displayHeight, rotation: 0 };
  }
};
