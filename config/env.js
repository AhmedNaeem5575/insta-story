import dotenv from 'dotenv';
import path from 'path';

// Load .env from parent directory
dotenv.config();

export const config = {
  // Instagram Credentials
  igUsername: process.env.IG_USERNAME,
  igPassword: process.env.IG_PASSWORD,
  igTargetUsername: process.env.IG_TARGET_USERNAME,

  // Laravel API Configuration
  laravelApiUrl: process.env.LARAVEL_API_URL,
  laravelApiKey: process.env.LARAVEL_API_KEY,

  // Proxy Configuration
  proxyUrl: process.env.PROXY_URL,

  // Force Manual Login
  forceManualLogin: process.env.FORCE_MANUAL_LOGIN === 'true',

  // Session File
  sessionFile: path.join(process.cwd(), 'ig-session.json'),

  // Formspree for notifications
  formspreeUrl: process.env.FORMSPREE_URL || 'https://formspree.io/f/xpwyejve',

  // Instagram URLs
  instagramUrl: 'https://www.instagram.com',

  // Timeouts (in milliseconds)
  loginTimeout: 60000,
  storyLoadTimeout: 30000,
  navigationTimeout: 30000,

  // Retry settings
  maxRetries: 3,
  retryDelay: 2000,

  // Story viewing duration (ms) - how long to view each story
  storyViewDuration: 3000,
};

// Validate required config
export function validateConfig() {
  const required = ['igUsername', 'igPassword', 'igTargetUsername'];
  const missing = required.filter(key => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (!config.laravelApiUrl || !config.laravelApiKey) {
    throw new Error('LARAVEL_API_URL and LARAVEL_API_KEY must be configured');
  }

  return true;
}
