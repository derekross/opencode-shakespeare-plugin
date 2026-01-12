/**
 * OpenCode Shakespeare Plugin
 * 
 * Provides NIP-46 remote signing, Shakespeare AI provider integration,
 * and mkstack project initialization for building Nostr applications
 * with AI assistance.
 */

import type { Plugin, Hooks, PluginInput } from '@opencode-ai/plugin';
import fs from 'node:fs';
import path from 'node:path';

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
import { configureShakespeareProvider, shakespeareAuth, SHAKESPEARE_BASE_URL } from './provider.js';

/**
 * Fetch Shakespeare AI models and create provider config
 */
async function fetchShakespeareModels(): Promise<Record<string, any>> {
  try {
    const response = await fetch(`${SHAKESPEARE_BASE_URL}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    const { data } = await response.json();
    
    const models: Record<string, any> = {};
    for (const model of data) {
      if (!model.type || model.type === 'chat') {
        models[model.id] = {
          name: model.name,
          limit: {
            context: model.context_window || 128000,
            output: 8192,
          },
          cost: {
            input: parseFloat(model.pricing?.prompt) || 0,
            output: parseFloat(model.pricing?.completion) || 0,
            cache_read: 0,
            cache_write: 0,
          },
          tool_call: true,
          temperature: true,
          attachment: true,
          reasoning: false,
          modalities: {
            input: ['text', 'image'],
            output: ['text'],
          },
        };
      }
    }
    return models;
  } catch {
    // Return default models if fetch fails
    return {
      'claude-sonnet-4.5': {
        name: 'Claude Sonnet 4.5',
        limit: { context: 200000, output: 8192 },
        cost: { input: 0.000003, output: 0.000015, cache_read: 0, cache_write: 0 },
        tool_call: true,
        temperature: true,
        attachment: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      'claude-opus-4.5': {
        name: 'Claude Opus 4.5',
        limit: { context: 200000, output: 8192 },
        cost: { input: 0.000005, output: 0.000025, cache_read: 0, cache_write: 0 },
        tool_call: true,
        temperature: true,
        attachment: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
    };
  }
}

/**
 * Ensure Shakespeare provider is configured in the project
 */
async function ensureProviderConfig(directory: string): Promise<void> {
  const configPath = path.join(directory, 'opencode.json');
  
  let config: any = {};
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    // No existing config, will create new one
  }
  
  // Check if shakespeare provider already exists
  if (config.provider?.shakespeare?.models && Object.keys(config.provider.shakespeare.models).length > 0) {
    return; // Already configured
  }
  
  // Fetch models and add provider config
  const models = await fetchShakespeareModels();
  
  config.provider = config.provider || {};
  config.provider.shakespeare = {
    name: 'Shakespeare AI',
    api: SHAKESPEARE_BASE_URL,
    npm: '@ai-sdk/openai-compatible',
    models,
  };
  
  // Write updated config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Note: We intentionally don't re-export signer/storage modules here
// as it causes issues with OpenCode's plugin loading.
// Tools import these modules directly as needed.

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
 *   "plugin": ["opencode-shakespeare-plugin"]
 * }
 * ```
 * 
 * Then run `shakespeare_connect` to authenticate via QR code.
 */
export const ShakespearePlugin: Plugin = async (input: PluginInput) => {
  // Auto-configure Shakespeare provider in the project's opencode.json
  await ensureProviderConfig(input.directory);
  
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
