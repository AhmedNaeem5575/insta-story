import { chromium } from 'playwright';
import { config } from '../config/env.js';
import { log } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Session Manager for persisting browser context
 */
export class SessionManager {
  constructor() {
    this.sessionFile = config.sessionFile;
  }

  /**
   * Save browser session to file
   */
  async saveSession(context, page = null) {
    try {
      // Get cookies
      const cookies = await context.cookies();

      // Get local storage - need a page for this
      let localStorage = {};
      if (page) {
        try {
          localStorage = await page.evaluate(() => {
            const items = {};
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              items[key] = window.localStorage.getItem(key);
            }
            return items;
          });
        } catch (e) {
          // Local storage might not be accessible
          log('⚠ Impossibile salvare localStorage');
        }
      }

      const sessionData = {
        cookies,
        localStorage,
        savedAt: new Date().toISOString(),
      };

      await fs.mkdir(path.dirname(this.sessionFile), { recursive: true });
      await fs.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2));

      log('✓ Sessione salvata');
    } catch (error) {
      log(`⚠ Errore salvataggio sessione: ${error.message}`);
    }
  }

  /**
   * Load browser session from file
   */
  async loadSession(context) {
    try {
      const sessionData = await fs.readFile(this.sessionFile, 'utf-8');
      const session = JSON.parse(sessionData);

      // Check if session is recent (less than 7 days old)
      const savedAt = new Date(session.savedAt);
      const daysSinceSave = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceSave > 7) {
        log('⚠ Sessione scaduta (> 7 giorni), nuovo login richiesto');
        return false;
      }

      // Restore cookies
      await context.addCookies(session.cookies);

      // Restore local storage
      await context.addInitScript((storage) => {
        for (const [key, value] of Object.entries(storage)) {
          window.localStorage.setItem(key, value);
        }
      }, session.localStorage);

      log(`✓ Sessione caricata (salvata ${Math.round(daysSinceSave * 24)} ore fa)`);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log(`⚠ Errore caricamento sessione: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Check if session file exists
   */
  async hasSession() {
    try {
      await fs.access(this.sessionFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete session file
   */
  async clearSession() {
    try {
      await fs.unlink(this.sessionFile);
      log('✓ Sessione cancellata');
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Get session age in hours
   */
  async getSessionAge() {
    try {
      const sessionData = await fs.readFile(this.sessionFile, 'utf-8');
      const session = JSON.parse(sessionData);
      const savedAt = new Date(session.savedAt);
      const hoursSinceSave = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
      return hoursSinceSave;
    } catch {
      return Infinity;
    }
  }
}
