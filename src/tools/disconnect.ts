/**
 * shakespeare_disconnect tool
 * Clear stored credentials and disconnect
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner } from '../signer.js';
import { xdgData } from 'xdg-basedir';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Clear Shakespeare auth from OpenCode's auth.json
 */
async function clearOpencodeAuth(): Promise<void> {
  if (!xdgData) return;
  
  const authPath = path.join(xdgData, 'opencode', 'auth.json');
  const text = await fs.readFile(authPath, 'utf-8').catch(() => '{}');
  const data = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  })();
  
  // Remove shakespeare auth entry
  delete data['shakespeare'];
  await fs.writeFile(authPath, JSON.stringify(data, null, 2));
}

export const disconnect = tool({
  description: 'Disconnect from the current Nostr remote signer session and clear stored credentials. Use this to switch to a different Nostr identity or to log out.',
  args: {},
  async execute() {
    const signer = getSigner();

    if (!signer.isConnected()) {
      return 'Not currently connected. Nothing to disconnect.';
    }

    const npub = signer.getUserNpub();
    await signer.disconnect();
    
    // Clear from OpenCode's auth.json as well
    await clearOpencodeAuth();

    return `Disconnected from ${npub}. Credentials cleared. Use shakespeare_connect to authenticate again.`;
  },
});
