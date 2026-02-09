/**
 * shakespeare_disconnect tool
 * Clear stored credentials and disconnect
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner } from '../signer.js';
import { clearOpencodeAuth } from '../opencode-auth.js';

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
