/**
 * shakespeare_complete tool
 * Completes NIP-46 connection after QR code scanning
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner } from '../signer.js';
import { xdgData } from 'xdg-basedir';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Update OpenCode's auth.json to reflect the connection status
 */
async function updateOpencodeAuth(): Promise<void> {
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
  
  data['shakespeare'] = { type: 'api', key: 'nostr-nip46-connected' };
  await fs.mkdir(path.dirname(authPath), { recursive: true });
  await fs.writeFile(authPath, JSON.stringify(data, null, 2));
}

export const complete = tool({
  description: 'Complete the NIP-46 connection after scanning the QR code. This waits for the remote signer to respond and saves the connection state.',
  args: {
    timeout: tool.schema
      .number()
      .optional()
      .describe('Timeout in seconds to wait for connection (default: 300)'),
  },
  async execute(args) {
    const signer = getSigner();
    
    // Check if already connected
    if (signer.isConnected()) {
      const status = signer.getStatus();
      await updateOpencodeAuth();
      return `Already connected as ${status.npub}.`;
    }

    // Check if there's a pending connection
    if (!signer.hasPendingConnection()) {
      return 'No pending connection. Run shakespeare_connect first to generate a QR code.';
    }

    const timeoutMs = (args.timeout || 300) * 1000;

    try {
      const result = await signer.completeConnection(timeoutMs);
      await updateOpencodeAuth();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `Connection failed: ${message}`;
    }
  },
});
