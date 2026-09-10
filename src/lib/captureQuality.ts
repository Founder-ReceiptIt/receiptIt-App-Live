export type CaptureAdvice = 'neutral' | 'dark' | 'moving' | 'small' | 'cropped' | 'glare' | 'long' | 'ready';
export type Point = [number, number];
export interface QualityFrame { width: number; height: number; pixels: Uint8ClampedArray }
export interface QualityResult {
  advice: CaptureAdvice;
  boundary: Point[] | null;
  width: number;
  height: number;
}
export const CAPTURE_ADVICE: Record<CaptureAdvice, string> = {
  neutral: 'Frame your receipt', dark: 'More light needed', moving: 'Hold still',
  small: 'Move closer', cropped: 'Fit the whole receipt in frame', glare: 'Watch for glare',
  long: 'Scan in sections if needed', ready: 'Ready',
};

// These are preview heuristics, NOT document classification, OCR or upload validation.
// Bounded input is important: the camera's full-resolution capture never enters here.
export function analyseCaptureFrame(frame: QualityFrame, previous?: Uint8Array, basicOnly = false) {
  const { width: w, height: h, pixels } = frame;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w > 192 || h > 192 || pixels.length !== w * h * 4) throw new Error('Invalid preview sample');
  const n = w * h;
  const grey = new Uint8Array(n);
  const histogram = new Uint32Array(256);
  let mean = 0;
  let previousMean = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    grey[i] = (pixels[p] * 77 + pixels[p + 1] * 150 + pixels[p + 2] * 29) >> 8;
    histogram[grey[i]]++;
    mean += grey[i];
    if (previous?.length === n) previousMean += previous[i];
  }
  mean /= n; previousMean /= n;
  let movement = 0;
  if (previous?.length === n) {
    for (let i = 0; i < n; i++) movement += Math.abs((grey[i] - mean) - (previous[i] - previousMean));
    movement /= n;
  }
  const percentile = (fraction: number) => {
    let sum = 0;
    for (let i = 0; i < 256; i++) { sum += histogram[i]; if (sum >= n * fraction) return i; }
    return 255;
  };
  const result: QualityResult = { advice: 'neutral', boundary: null, width: w, height: h };
  if (mean < 60) result.advice = 'dark';
  else if (movement > 10) result.advice = 'moving';
  if (basicOnly) return { result, grey, metrics: { mean, movement, sharpness: 0, documentArea: 0 } };

  // Find a light, approximately neutral paper region contrasting with its background.
  // Connected components tolerate text holes, mild bends and partial occlusion.
  const low = percentile(0.12), high = percentile(0.98);
  const threshold = Math.max(45, Math.min(high - 14, low + (high - low) * 0.55));
  const mask = new Uint8Array(n);
  if (high - low >= 28) {
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const chroma = Math.max(pixels[p], pixels[p + 1], pixels[p + 2]) - Math.min(pixels[p], pixels[p + 1], pixels[p + 2]);
      mask[i] = grey[i] > threshold && chroma < 65 ? 1 : 0;
    }
  }
  const queue = new Int32Array(n);
  let best: { area: number; minX: number; minY: number; maxX: number; maxY: number; corners: Point[]; paper: number } | null = null;
  for (let seed = 0; seed < n; seed++) {
    if (!mask[seed]) continue;
    let head = 0, tail = 1, minX = w, minY = h, maxX = 0, maxY = 0, paper = 0;
    const corners: Point[] = [[w, h], [0, h], [0, 0], [w, 0]];
    queue[0] = seed; mask[seed] = 0;
    while (head < tail) {
      const index = queue[head++], x = index % w, y = Math.floor(index / w);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      paper += grey[index];
      if (x + y < corners[0][0] + corners[0][1]) corners[0] = [x, y];
      if (x - y > corners[1][0] - corners[1][1]) corners[1] = [x, y];
      if (x + y > corners[2][0] + corners[2][1]) corners[2] = [x, y];
      if (y - x > corners[3][1] - corners[3][0]) corners[3] = [x, y];
      if (x > 0 && mask[index - 1]) { mask[index - 1] = 0; queue[tail++] = index - 1; }
      if (x < w - 1 && mask[index + 1]) { mask[index + 1] = 0; queue[tail++] = index + 1; }
      if (y > 0 && mask[index - w]) { mask[index - w] = 0; queue[tail++] = index - w; }
      if (y < h - 1 && mask[index + w]) { mask[index + w] = 0; queue[tail++] = index + w; }
    }
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    const polygonArea = Math.abs(corners.reduce((sum, p, i) => { const q = corners[(i + 1) % 4]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    if (tail < n * 0.035 || tail > n * 0.97 || tail / boxArea < 0.48 || polygonArea < tail * 0.8 || polygonArea > tail * 1.8) continue;
    if (!best || tail > best.area) best = { area: tail, minX, minY, maxX, maxY, corners, paper: paper / tail };
  }

  let sharpness = 0;
  let documentArea = 0;
  if (best) {
    const { minX, minY, maxX, maxY, paper } = best;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    let samples = 0, ink = 0, inkRows = 0, lapSum = 0, lapSquared = 0, bright = 0;
    // Exclude the paper boundary so a sharp outline alone cannot imply sharp text.
    const inset = Math.max(3, Math.floor(Math.min(bw, bh) * 0.06));
    for (let y = Math.max(1, minY + inset); y <= Math.min(h - 2, maxY - inset); y++) {
      let rowInk = 0;
      for (let x = Math.max(1, minX + inset); x <= Math.min(w - 2, maxX - inset); x++) {
        const i = y * w + x;
        const lap = grey[i - 1] + grey[i + 1] + grey[i - w] + grey[i + w] - 4 * grey[i];
        samples++; lapSum += lap; lapSquared += lap * lap;
        if (grey[i] < paper - 18) { ink++; rowInk++; }
        if (grey[i] >= 253) bright++;
      }
      if (rowInk >= Math.max(2, bw * 0.06) && rowInk < bw * 0.65) inkRows++;
    }
    const inkFraction = ink / Math.max(1, samples);
    sharpness = Math.max(0, lapSquared / Math.max(1, samples) - (lapSum / Math.max(1, samples)) ** 2);
    // Blank walls/paper and solid white UI boxes must not get a Ready endorsement.
    const textLike = inkRows >= 4 && inkFraction >= 0.018 && inkFraction <= 0.42;
    if (textLike) {
      documentArea = bw * bh / n;
      result.boundary = best.corners.map(([x, y]) => [x / w, y / h]);
      if (result.advice === 'dark' && paper >= 115) result.advice = movement > 10 ? 'moving' : 'neutral';
      if (paper < 92) result.advice = 'dark';
      else if (result.advice === 'neutral') {
        const cropped = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
        const long = Math.min(bw, bh) / Math.max(bw, bh) < 0.2;
        if (cropped && documentArea > 0.15) result.advice = long ? 'long' : 'cropped';
        // Only a local clipped highlight on otherwise dimmer paper is a glare hint.
        // Uniform bright white paper is deliberately not called glare.
        else if (paper < 231 && bright / Math.max(1, samples) > 0.09 && bright / Math.max(1, samples) < 0.55) result.advice = 'glare';
        else if (long) result.advice = 'long';
        else if (documentArea < 0.19) result.advice = 'small';
        else if (sharpness < 90) result.advice = 'moving';
        else if (previous?.length === n && movement < 6) result.advice = 'ready';
      }
    }
  }
  return { result, grey, metrics: { mean, movement, sharpness, documentArea } };
}

export interface AdviceMemory { candidate: CaptureAdvice; consecutive: number; shown: CaptureAdvice; shownAt: number; longShown: boolean }
export function settleCaptureAdvice(memory: AdviceMemory, advice: CaptureAdvice, now: number): AdviceMemory {
  const next = { ...memory, candidate: advice, consecutive: memory.candidate === advice ? memory.consecutive + 1 : 1 };
  // About one second of agreement, then at least two seconds between message changes.
  // A long-receipt hint is shown only once per camera opening, never repeatedly nagged.
  if (next.consecutive >= 3 && now - memory.shownAt >= 2000 && advice !== memory.shown) {
    next.shown = advice === 'long' && memory.longShown ? 'neutral' : advice;
    next.shownAt = now;
    if (advice === 'long') next.longShown = true;
  }
  return next;
}
