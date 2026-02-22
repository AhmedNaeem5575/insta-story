#!/usr/bin/env node
/**
 * Clear Instagram session file
 * Use this if you need to re-login
 */

import fs from 'fs/promises';
import path from 'path';

const sessionFile = path.join(process.cwd(), 'ig-session.json');

async function clearSession() {
  try {
    await fs.unlink(sessionFile);
    console.log('✓ Sessione cancellata con successo');
    console.log('  Al prossimo avvio, ti verrà chiesto di effettuare nuovamente il login');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('⚠ Nessuna sessione trovata');
    } else {
      console.log(`❌ Errore cancellazione sessione: ${error.message}`);
    }
  }
}

clearSession();
