/**
 * shakespeare_status tool
 * Check NIP-46 connection status
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner } from '../signer.js';
import { getConfigDir } from '../storage.js';

export const status = tool({
  description: 'Check the current Nostr authentication status. Returns whether a connection is established, the connected user pubkey/npub, and the relays being used.',
  args: {},
  async execute() {
    const signer = getSigner();
    const signerStatus = signer.getStatus();

    if (signerStatus.connected) {
      return JSON.stringify({
        connected: true,
        userPubkey: signerStatus.userPubkey,
        npub: signerStatus.npub,
        relays: signerStatus.relays,
        configDir: getConfigDir(),
      }, null, 2);
    } else {
      return JSON.stringify({
        connected: false,
        message: 'Not connected. Use shakespeare_connect to authenticate via NIP-46 remote signing.',
        configDir: getConfigDir(),
      }, null, 2);
    }
  },
});
