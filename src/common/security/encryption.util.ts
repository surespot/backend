import * as crypto from 'crypto';

// Simple symmetric encryption helpers for sensitive fields like NIN.
// Uses AES-256-GCM with a key derived from NIN_ENCRYPTION_KEY.

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const secret = process.env.NIN_ENCRYPTION_KEY || 'surespot-nin-fallback-key';
  // Derive a 32-byte key from the secret
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptNin(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Store as base64(iv):base64(tag):base64(ciphertext)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptNin(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid NIN ciphertext format');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
