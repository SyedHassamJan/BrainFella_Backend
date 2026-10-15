import { BadRequestException } from '@nestjs/common';

export type TherapistFileKind = 'CV' | 'PHOTO';

/** Accepted types per kind. A CV may be a PDF or a scanned image; a photo must be an image. */
const ALLOWED: Record<TherapistFileKind, string[]> = {
  CV: ['application/pdf', 'image/jpeg', 'image/png'],
  PHOTO: ['image/jpeg', 'image/png'],
};

export const MAX_BYTES: Record<TherapistFileKind, number> = {
  CV: 5 * 1024 * 1024,
  PHOTO: 2 * 1024 * 1024,
};

const LABEL: Record<TherapistFileKind, string> = { CV: 'CV', PHOTO: 'Profile photo' };

/**
 * The real type, read from the file's first bytes. The browser-supplied type
 * and file name are never trusted (anyone can rename a file).
 */
export function sniffMimeType(buf: Buffer): string | null {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/** Decodes a base64 upload (a `data:` URL prefix is allowed) and checks its size and real type. */
export function decodeTherapistFile(kind: TherapistFileKind, base64: string): { data: Buffer; mimeType: string } {
  const raw = base64.replace(/^data:[^;,]+;base64,/, '');
  const data = Buffer.from(raw, 'base64');
  if (data.length === 0) throw new BadRequestException(`${LABEL[kind]} is empty or not a valid file.`);
  if (data.length > MAX_BYTES[kind]) {
    throw new BadRequestException(`${LABEL[kind]} is too large (max ${MAX_BYTES[kind] / (1024 * 1024)} MB).`);
  }
  const mimeType = sniffMimeType(data);
  if (!mimeType || !ALLOWED[kind].includes(mimeType)) {
    throw new BadRequestException(kind === 'CV' ? 'CV must be a PDF, JPG or PNG file.' : 'Profile photo must be a JPG or PNG image.');
  }
  return { data, mimeType };
}

/**
 * Stores WhatsApp numbers as international digits only (what wa.me links need).
 * Accepts "+92 300 1234567", "0092...", or a local Pakistani "03001234567".
 * Returns null if it cannot be a phone number.
 */
export function normalizeWhatsappNumber(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('03')) digits = `92${digits.slice(1)}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}
