// Separate from the one-use signup permission. No account data is included.
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const encoder = new TextEncoder();
const keyFor = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(`receiptit:beta-device:v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function issueBetaDeviceGrant(secret: string, epoch: string) {
  const payload = encode(encoder.encode(JSON.stringify({ purpose: 'beta-device', version: 1, epoch, expires: Math.floor(Date.now() / 1000) + 180 * 86400, nonce: crypto.randomUUID() })));
  return `${payload}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(secret), encoder.encode(payload))))}`;
}

export async function verifyBetaDeviceGrant(token: string, secret: string, epoch: string) {
  try {
    if (token.length > 1024) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    if (!await crypto.subtle.verify('HMAC', await keyFor(secret), decode(parts[1]), encoder.encode(parts[0]))) return false;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    return payload.purpose === 'beta-device' && payload.version === 1 && payload.epoch === epoch
      && Number.isFinite(payload.expires) && payload.expires > Date.now() / 1000;
  } catch {
    return false;
  }
}
