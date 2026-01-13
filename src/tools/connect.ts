/**
 * shakespeare_connect tool
 * Initiates NIP-46 connection with QR code display
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner, DEFAULT_RELAYS } from '../signer.js';
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

export const connect = tool({
  description: `Generate a nostrconnect:// URI and QR code for NIP-46 remote signing. Scan the QR code with Amber (Android) or Primal (Android/iOS) to connect. This will wait up to 5 minutes for you to scan and approve. Default relays: ${DEFAULT_RELAYS.join(', ')}`,
  args: {
    relays: tool.schema
      .string()
      .optional()
      .describe(`Comma-separated list of relay URLs to use for NIP-46 communication. Defaults to ${DEFAULT_RELAYS.join(', ')}`),
  },
  async execute(args) {
    const signer = getSigner();

    // Check if already connected
    if (signer.isConnected()) {
      const status = signer.getStatus();
      // Make sure OpenCode auth is updated even if already connected
      await updateOpencodeAuth();
      return `Already connected as ${status.npub}. Use shakespeare_disconnect first if you want to reconnect with a different identity.`;
    }

    // Parse relays if provided
    const relays = args.relays
      ? args.relays.split(',').map(r => r.trim()).filter(r => r.startsWith('wss://'))
      : undefined;

    try {
      // Use blocking connect - waits for QR scan and approval
      const result = await signer.connect(relays);
      await updateOpencodeAuth();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `Connection failed: ${message}`;
    }
  },
});
