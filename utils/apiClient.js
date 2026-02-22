import fetch from 'node-fetch';
import { config } from '../config/env.js';
import { log } from './logger.js';

/**
 * Send data to Laravel API
 */
export async function sendToApi(endpoint, data) {
  try {
    const url = `${config.laravelApiUrl}/${endpoint}`;
    const headers = {
      'X-API-Key': config.laravelApiKey,
      'Content-Type': 'application/json',
    };

    log(`✓ API request: ${endpoint}: ${data}`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      timeout: 30000,
    });

    if (response.status === 200) {
      const result = await response.json();
      log(`✓ API ${endpoint}: ${result.saved || 0} nuovi, ${result.updated || 0} aggiornati, response: ${result}`);
      return { success: true, data: result };
    } else {
      const text = await response.text();
      log(`❌ API ${endpoint} errore ${response.status}: ${text}`);
      return { success: false, error: text };
    }
  } catch (error) {
    log(`❌ Errore invio API ${endpoint}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test API connectivity
 */
export async function testApiConnection() {
  try {
    const url = `${config.laravelApiUrl}/ping`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': config.laravelApiKey },
      timeout: 10000,
    });

    if (response.status === 200) {
      log('✓ Connessione API Laravel OK');
      return true;
    } else {
      log(`❌ ERRORE: API Laravel non risponde correttamente (${response.status})`);
      return false;
    }
  } catch (error) {
    log(`❌ ERRORE: Impossibile connettersi all'API Laravel: ${error.message}`);
    return false;
  }
}