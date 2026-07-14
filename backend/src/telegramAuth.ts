import * as crypto from 'crypto';

// Token must be loaded securely
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ENABLE_MOCK_AUTH = process.env.ENABLE_MOCK_AUTH === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Strict requirement: Production startup must fail if mock authentication is enabled.
if (NODE_ENV === 'production' && ENABLE_MOCK_AUTH) {
  const errorMsg = 'CRITICAL CONFIGURATION ERROR: Mock authentication cannot be enabled in production environments!';
  console.error(errorMsg);
  process.exit(1);
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface AuthResult {
  valid: boolean;
  error?: string;
  user?: TelegramUser;
}

/**
 * Validates raw Telegram WebApp initData query string.
 * Employs cryptographic hmac-sha256 matching Telegram spec, timing-safe checks, and freshness controls.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string = BOT_TOKEN,
  allowMock: boolean = ENABLE_MOCK_AUTH
): AuthResult {
  if (!initData) {
    return { valid: false, error: 'Missing initData string.' };
  }

  // Check if mock mode is requested and allowed
  if (initData.startsWith('mock_')) {
    if (!allowMock) {
      return { valid: false, error: 'Mock authentication is disabled.' };
    }
    // Parse mock user format "mock_userId_username"
    const parts = initData.split('_');
    const userId = parseInt(parts[1] || '1111', 10);
    const username = parts[2] || 'mock_user';
    return {
      valid: true,
      user: {
        id: userId,
        first_name: 'Mock',
        last_name: 'User',
        username
      }
    };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      return { valid: false, error: 'Missing hash parameter.' };
    }

    const authDateStr = params.get('auth_date');
    if (!authDateStr) {
      return { valid: false, error: 'Missing auth_date parameter.' };
    }

    const authDate = parseInt(authDateStr, 10);
    if (isNaN(authDate)) {
      return { valid: false, error: 'Invalid auth_date parameter.' };
    }

    // Validate freshness of auth_date (must be within 24 hours / 86400 seconds)
    const currentTime = Math.floor(Date.now() / 1000);
    const age = currentTime - authDate;
    if (age < 0 || age > 86400) {
      return { valid: false, error: 'Authentication signature has expired.' };
    }

    // Build data-check string
    const keys = Array.from(params.keys()).filter(k => k !== 'hash');
    keys.sort();

    const dataCheckString = keys.map(k => `${k}=${params.get(k)}`).join('\n');

    // Generate secret key (HMAC-SHA256 with "WebAppData" and botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Generate timing-safe check signature
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Use timing-safe compare to avoid side-channel timing attacks
    const bufferCalculated = Buffer.from(calculatedHash, 'hex');
    const bufferReceived = Buffer.from(hash, 'hex');

    if (bufferCalculated.length !== bufferReceived.length) {
      return { valid: false, error: 'Cryptographic signature verification failed.' };
    }

    if (!crypto.timingSafeEqual(bufferCalculated, bufferReceived)) {
      return { valid: false, error: 'Cryptographic signature mismatch.' };
    }

    // Parse user object if available
    const userJson = params.get('user');
    let user: TelegramUser | undefined;
    if (userJson) {
      user = JSON.parse(userJson) as TelegramUser;
    }

    return { valid: true, user };
  } catch (err: any) {
    return { valid: false, error: `Internal auth parser fault: ${err.message}` };
  }
}
