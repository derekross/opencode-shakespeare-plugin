/**
 * OpenCode Shakespeare Plugin
 * 
 * Provides NIP-46 remote signing and mkstack project initialization
 * for building Nostr applications with AI assistance.
 */

import type { Plugin } from '@opencode-ai/plugin';

// Import tools
import { connect } from './tools/connect.js';
import { status } from './tools/status.js';
import { disconnect } from './tools/disconnect.js';
import { sign } from './tools/sign.js';
import { pubkey } from './tools/pubkey.js';
import { init } from './tools/init.js';
import { deploy } from './tools/deploy.js';
import { ngit } from './tools/ngit.js';

// Note: We intentionally don't re-export signer/storage modules here
// as it causes issues with OpenCode's plugin loading.
// Tools import these modules directly as needed.

/**
 * Shakespeare Plugin for OpenCode
 * 
 * Provides tools for:
 * - NIP-46 remote signing (connect, disconnect, sign events)
 * - Project initialization with mkstack framework
 * - Nostr authentication status management
 * 
 * Usage in opencode.json:
 * ```json
 * {
 *   "plugin": ["opencode-shakespeare-plugin"],
 *   "mcp": {
 *     "nostr": {
 *       "type": "local",
 *       "command": ["npx", "-y", "@nostrbook/mcp@latest"]
 *     }
 *   }
 * }
 * ```
 */
export const ShakespearePlugin: Plugin = async () => {
  return {
    // Register custom tools
    tool: {
      shakespeare_connect: connect,
      shakespeare_status: status,
      shakespeare_disconnect: disconnect,
      shakespeare_sign_event: sign,
      shakespeare_get_pubkey: pubkey,
      shakespeare_init: init,
      shakespeare_deploy: deploy,
      shakespeare_ngit: ngit,
    },
  };
};

// Default export for OpenCode plugin loading
export default ShakespearePlugin;
