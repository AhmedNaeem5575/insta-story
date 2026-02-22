import fetch from 'node-fetch';
import { config } from '../config/env.js';
import { log } from './logger.js';

/**
 * Send error notification via Formspree
 */
export async function sendErrorNotification(errorType, errorMessage, details = {}) {
  try {
    const data = {
      script: 'ig_sync_stories.js (Node.js)',
      error_type: errorType,
      error_message: errorMessage,
      timestamp: new Date().toISOString(),
      target_account: config.igTargetUsername,
      login_account: config.igUsername,
      ...details,
    };

    const response = await fetch(config.formspreeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 10000,
    });

    if (response.status === 200) {
      log('✓ Notifica errore inviata via email');
    } else {
      log(`⚠ Impossibile inviare notifica errore: ${response.status}`);
    }
  } catch (error) {
    log(`⚠ Errore invio notifica: ${error.message}`);
  }
}

/**
 * Send success notification via Formspree
 */
export async function sendSuccessNotification(storiesCount, logMessages) {
  try {
    const data = {
      script: 'ig_sync_stories.js (Node.js)',
      status: 'SUCCESS',
      stories_processed: storiesCount,
      timestamp: new Date().toISOString(),
      target_account: config.igTargetUsername,
      login_account: config.igUsername,
      log: logMessages.slice(-50).join('\n'),
    };

    const response = await fetch(config.formspreeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      timeout: 10000,
    });

    if (response.status === 200) {
      log('✓ Notifica successo inviata via email');
    } else {
      log(`⚠ Impossibile inviare notifica successo: ${response.status}`);
    }
  } catch (error) {
    log(`⚠ Errore invio notifica successo: ${error.message}`);
  }
}
