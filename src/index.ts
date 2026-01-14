/**
 * OpenCode Shakespeare Plugin
 * 
 * Provides NIP-46 remote signing, Shakespeare AI provider integration,
 * and mkstack project initialization for building Nostr applications
 * with AI assistance.
 */

import type { Plugin, PluginInput } from '@opencode-ai/plugin';

// Import tools
import { connect } from './tools/connect.js';
import { complete } from './tools/complete.js';
import { status } from './tools/status.js';
import { disconnect } from './tools/disconnect.js';
import { sign } from './tools/sign.js';
import { pubkey } from './tools/pubkey.js';
import { init } from './tools/init.js';
import { deploy } from './tools/deploy.js';
import { ngit } from './tools/ngit.js';

// Import provider integration
import { configureShakespeareProvider, shakespeareAuth } from './provider.js';

/**
 * Shakespeare Plugin for OpenCode
 * 
 * Provides:
 * - Shakespeare AI provider with NIP-98 authentication (no nsec required)
 * - NIP-46 remote signing (connect via QR code with Amber/Primal)
 * - Project initialization with mkstack framework
 * - Shakespeare Deploy for static sites
 * - Nostr Git (ngit) for decentralized git hosting
 * 
 * Usage in opencode.json:
 * ```json
 * {
 *   "plugin": ["@shakespeare.diy/opencode-plugin"]
 * }
 * ```
 * 
 * Then run `shakespeare_connect` to authenticate via QR code.
 */
export const ShakespearePlugin: Plugin = async (_input: PluginInput) => {
  return {
    // Register Shakespeare AI provider
    config: configureShakespeareProvider,
    
    // Register NIP-98 auth for Shakespeare provider
    auth: shakespeareAuth,
    
    // Register custom tools
    tool: {
      shakespeare_connect: connect,
      shakespeare_complete: complete,
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
