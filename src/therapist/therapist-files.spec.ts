import { BadRequestException } from '@nestjs/common';
import { decodeTherapistFile, MAX_BYTES, normalizeWhatsappNumber, sniffMimeType } from './therapist-files';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]);
const b64 = (b: Buffer) => b.toString('base64');

describe('sniffMimeType', () => {
  it('reads the real type from the file contents', () => {
    expect(sniffMimeType(PDF)).toBe('application/pdf');
    expect(sniffMimeType(JPEG)).toBe('image/jpeg');
    expect(sniffMimeType(PNG)).toBe('image/png');
    expect(sniffMimeType(EXE)).toBeNull();
  });
});

describe('decodeTherapistFile', () => {
  it('accepts a PDF or image CV, and a data: URL prefix', () => {
    expect(decodeTherapistFile('CV', b64(PDF)).mimeType).toBe('application/pdf');
    expect(decodeTherapistFile('CV', `data:application/pdf;base64,${b64(PDF)}`).data.equals(PDF)).toBe(true);
    expect(decodeTherapistFile('CV', b64(PNG)).mimeType).toBe('image/png');
  });

  it('rejects a PDF as a photo, an executable renamed to .pdf, empty and oversized files', () => {
    expect(() => decodeTherapistFile('PHOTO', b64(PDF))).toThrow(BadRequestException);
    expect(() => decodeTherapistFile('CV', b64(EXE))).toThrow(BadRequestException);
    expect(() => decodeTherapistFile('CV', '')).toThrow(BadRequestException);
    const huge = Buffer.concat([JPEG, Buffer.alloc(MAX_BYTES.PHOTO)]);
    expect(() => decodeTherapistFile('PHOTO', b64(huge))).toThrow(/too large/);
  });
});

describe('normalizeWhatsappNumber', () => {
  it.each([
    ['+92 300 1234567', '923001234567'],
    ['0092-300-1234567', '923001234567'],
    ['03001234567', '923001234567'],
    ['+44 7700 900123', '447700900123'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeWhatsappNumber(input)).toBe(expected);
  });

  it.each(['12345', 'not a number', '', '0000000000'])('rejects %s', (input) => {
    expect(normalizeWhatsappNumber(input)).toBeNull();
  });
});
