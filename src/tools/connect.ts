/**
 * shakespeare_connect tool
 * Initiates NIP-46 connection with QR code display
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner, DEFAULT_RELAYS } from '../signer.js';

export const connect = tool({
  description: `Initiate a Nostr remote signing connection using NIP-46. This will display a QR code that the user can scan with Amber (Android) or Primal (Android/iOS). The connection allows Shakespeare to sign Nostr events on behalf of the user without ever having access to their private key. Default relays: ${DEFAULT_RELAYS.join(', ')}`,
  args: {
    relays: tool.schema
      .string()
      .optional()
      .describe('Comma-separated list of relay URLs to use for NIP-46 communication. Defaults to wss://relay.ditto.pub,wss://relay.primal.net'),
  },
  async execute(args) {
    const signer = getSigner();

    // Check if already connected
    if (signer.isConnected()) {
      const status = signer.getStatus();
      return `Already connected as ${status.npub}. Use shakespeare_disconnect first if you want to reconnect with a different identity.`;
    }

    // Parse relays if provided
    const relays = args.relays
      ? args.relays.split(',').map(r => r.trim()).filter(r => r.startsWith('wss://'))
      : undefined;

    try {
      const result = await signer.connect(relays);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `Connection failed: ${message}`;
    }
  },
});
