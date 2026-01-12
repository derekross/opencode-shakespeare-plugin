/**
 * shakespeare_get_pubkey tool
 * Get the connected user's public key
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner } from '../signer.js';

export const pubkey = tool({
  description: 'Get the public key of the currently connected Nostr user. Returns both hex and npub formats.',
  args: {},
  async execute() {
    const signer = getSigner();

    if (!signer.isConnected()) {
      return JSON.stringify({
        error: 'Not connected. Use shakespeare_connect first to authenticate.',
        connected: false,
      });
    }

    const status = signer.getStatus();

    return JSON.stringify({
      connected: true,
      pubkey: status.userPubkey,
      npub: status.npub,
    }, null, 2);
  },
});
