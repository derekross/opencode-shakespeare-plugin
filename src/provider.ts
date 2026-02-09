/**
 * Shakespeare AI Provider Integration
 * 
 * Registers Shakespeare AI as an OpenCode provider with NIP-98 authentication
 * using our NIP-46 remote signer (no nsec required).
 * 
 * This plugin does NOT write to opencode.json or auth.json - it only modifies
 * the in-memory config via hooks and provides authenticated fetch.
 */

import { NIP98Client, type NostrSigner, type NostrEvent } from '@nostrify/nostrify';
import { getSigner } from './signer.js';
import { loadAuthState, getAuthFilePath } from './storage.js';
import { nip19 } from 'nostr-tools';

/** Shakespeare AI API base URL */
export const SHAKESPEARE_BASE_URL = 'https://ai.shakespeare.diy/v1';

/**
 * Config hook - registers Shakespeare AI provider with available models (in-memory only)
 * 
 * This hook modifies the config object passed by OpenCode but does NOT write to disk.
 * OpenCode handles config persistence separately.
 */
export async function configureShakespeareProvider(input: any): Promise<void> {
  // Initialize provider config (in-memory only)
  input.provider = input.provider || {};
  const provider = input.provider['shakespeare'] || {};

  // Set minimal provider metadata
  provider.name ||= 'Shakespeare AI';
  provider.api ||= SHAKESPEARE_BASE_URL;
  provider.npm ||= '@ai-sdk/openai-compatible';
  provider.options = provider.options || {};
  provider.options.baseURL ||= SHAKESPEARE_BASE_URL;

  // Only fetch models if not already configured
  if (!provider.models || Object.keys(provider.models).length === 0) {
    try {
      const response = await fetch(`${provider.options.baseURL}/models`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json();

      // Validate response shape before using it
      if (body && Array.isArray(body.data)) {
        provider.models = {};
        for (const model of body.data) {
          if (model && model.id && (!model.type || model.type === 'chat')) {
            provider.models[model.id] = {
              name: model.name || model.id,
            };
          }
        }
      }
    } catch {
      // Ignore errors fetching models — they'll be fetched on next startup
    }
  }

  input.provider['shakespeare'] = provider;
}

/**
 * Create a NostrSigner adapter that wraps our NIP-46 signer
 */
function createNostrSigner(): NostrSigner {
  const signer = getSigner();
  
  return {
    async getPublicKey(): Promise<string> {
      const status = signer.getStatus();
      return status.userPubkey || '';
    },
    async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
      return signer.signEvent(event as any);
    },
  };
}

/**
 * Create a fetch wrapper that adds NIP-98 authentication to requests.
 * 
 * The returned function lazily checks connection state at fetch time,
 * not at construction time. This avoids errors during plugin initialization
 * when the user hasn't connected yet.
 */
function createNip98Fetch(): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Check auth state at request time, not at construction time
    const authState = loadAuthState();
    if (!authState) {
      return Promise.reject(new Error(
        'Not connected to Nostr. Run shakespeare_connect to authenticate.\n' +
        `Auth file location: ${getAuthFilePath()}`
      ));
    }
    
    // Verify the signer can be restored
    const signer = getSigner();
    if (!signer.isConnected()) {
      return Promise.reject(new Error(
        'Failed to restore Nostr connection from saved credentials.\n' +
        'This can happen if the auth state is corrupted.\n' +
        'Try running shakespeare_disconnect then shakespeare_connect again.'
      ));
    }

    // Create NIP98Client with our NIP-46 signer adapter
    const nip98Client = new NIP98Client({
      signer: createNostrSigner(),
    });

    return nip98Client.fetch(input, init);
  };
}

/**
 * Auth hook - provides NIP-98 authenticated fetch using NIP-46 remote signer
 * 
 * The methods array provides a "Nostr (NIP-46)" auth option that checks
 * if the user is already connected via shakespeare_connect.
 */
export const shakespeareAuth = {
  provider: 'shakespeare',
  
  /**
   * Loader that returns a NIP-98 authenticated fetch function.
   * The fetch function lazily checks auth state so this loader never throws.
   */
  async loader(_getAuth: () => Promise<any>, _provider: any) {
    return {
      apiKey: 'nostr-nip46-connected', // Dummy key - NIP-98 auth replaces API key
      fetch: createNip98Fetch(),
    };
  },

  /**
   * Auth methods - provides NIP-46 authentication via OAuth-style flow
   * 
   * Uses 'oauth' type with 'auto' method. The authorize() returns immediately
   * with instructions (no URL redirect needed). The callback() then checks
   * if connected via shakespeare_connect and returns success.
   */
  methods: [
    {
      type: 'oauth' as const,
      label: 'Nostr (NIP-46)',
      async authorize() {
        // Check auth state directly from file (not singleton) to avoid module isolation issues
        const authState = loadAuthState();
        const isConnected = authState !== null && authState.userPubkey !== null;
        const npub = isConnected ? nip19.npubEncode(authState!.userPubkey) : null;
        
        return {
          url: '', // No URL needed - auth happens via shakespeare_connect tool
          instructions: isConnected 
            ? `Connected as ${npub}` 
            : 'Not connected. Run shakespeare_connect first.',
          method: 'auto' as const,
          async callback() {
            // Check auth state directly from file (not singleton) to avoid module isolation issues
            const authState = loadAuthState();
            const connected = authState !== null && authState.userPubkey !== null;
            
            if (connected) {
              return {
                type: 'success' as const,
                key: 'nostr-nip46-connected', // Dummy key - actual auth is via NIP-98
              };
            }
            
            return {
              type: 'failed' as const,
            };
          },
        };
      },
    },
  ],
};
