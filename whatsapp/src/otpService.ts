import crypto from 'crypto';
import { DEFAULT_LOCALE, Locale, translate } from './locale';

interface OTPRecord {
  code: string;
  expiresAt: number; // Unix timestamp ms
  attempts: number;
}

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes expiration
const MAX_ATTEMPTS = 3;

// In-memory OTP storage keyed by phone number hash
const otpStore = new Map<string, OTPRecord>();

/**
 * Generates a 6-digit numeric OTP that expires after 5 minutes.
 */
export function generateOTP(phoneHash: string): string {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + OTP_TTL_MS;

  otpStore.set(phoneHash, {
    code,
    expiresAt,
    attempts: 0
  });

  return code;
}

/**
 * Verifies an OTP code for a user.
 * Enforces 5-minute expiration and max attempt limits.
 */
export function verifyOTP(phoneHash: string, inputCode: string, locale: Locale = DEFAULT_LOCALE): { success: boolean; message: string } {
  const record = otpStore.get(phoneHash);

  if (!record) {
    return { success: false, message: translate(locale, 'No OTP request found. Please send "hi" to request a new code.', 'No hay una solicitud de verificación. Envía "hi" para pedir un código nuevo.') };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phoneHash);
    return { success: false, message: translate(locale, 'OTP has expired (valid for 5 minutes). Please request a new code.', 'El código caducó (es válido por 5 minutos). Solicita uno nuevo.') };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(phoneHash);
    return { success: false, message: translate(locale, 'Too many invalid attempts. Please request a new OTP code.', 'Demasiados intentos incorrectos. Solicita un código nuevo.') };
  }

  if (record.code !== inputCode.trim()) {
    record.attempts += 1;
    return { success: false, message: translate(locale,
      `Invalid OTP code. ${MAX_ATTEMPTS - record.attempts} attempts remaining.`,
      `Código incorrecto. Intentos restantes: ${MAX_ATTEMPTS - record.attempts}.`,
    ) };
  }

  // Verification successful: clear OTP code
  otpStore.delete(phoneHash);
  return { success: true, message: translate(locale, 'OTP verified successfully!', '¡Código verificado!') };
}
