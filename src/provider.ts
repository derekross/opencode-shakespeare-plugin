/**
 * Shakespeare AI Provider Integration
 * 
 * Registers Shakespeare AI as an OpenCode provider with NIP-98 authentication
 * using our NIP-46 remote signer (no nsec required).
 */

import { getToken } from 'nostr-tools/nip98';
import { xdgData } from 'xdg-basedir';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getSigner } from './signer.js';
import { loadAuthState } from './storage.js';
import { nip19 } from 'nostr-tools';

/** Shakespeare AI API base URL */
export
const SHAKESPEARE_BASE_URL = 'https://ai.shakespeare.diy/v1';

/**
 * Config hook - registers Shakespeare AI provider with available models
 */
export async function configureShakespeareProvider(input: any): Promise<void> {
  // Initialize provider config
  input.provider = input.provider || {};
  const provider = input.provider['shakespeare'] || {};

  provider.name ||= 'Shakespeare AI';
  provider.api ||= SHAKESPEARE_BASE_URL;
  provider.npm ||= '@ai-sdk/openai-compatible';
  provider.options = provider.options || {};
  provider.options.baseURL ||= SHAKESPEARE_BASE_URL;
  provider.options.includeUsage ??= true;

  // Fetch available models from Shakespeare AI
  try {
    const response = await fetch(`${provider.options.baseURL}/models`, {
      signal: AbortSignal.timeout(5000),
    });

    const { data } = await response.json();

    provider.models = data.reduce((models: Record<string, any>, model: any) => {
      if (!model.type || model.type === 'chat') {
        models[model.id] = {
          id: model.id,
          name: model.name,
          // Required fields for OpenCode model compatibility
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
          release_date: new Date().toISOString().split('T')[0],
          status: 'active',
        };
      }
      return models;
    }, {});
  } catch {
    // Ignore errors fetching models - will use defaults
  }

  input.provider['shakespeare'] = provider;

  // Check if already connected via NIP-46 and auto-setup auth
  const signer = getSigner();
  if (signer.isConnected()) {
    // Already authenticated via NIP-46, set up auth.json
    if (xdgData) {
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
  }
}

/**
 * Create a fetch wrapper that adds NIP-98 authentication to requests
 */
function createNip98Fetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Check auth state directly from file to handle module isolation
    const authState = loadAuthState();
    if (!authState) {
      throw new Error('Not connected to Nostr. Use shakespeare_connect first.');
    }
    
    // Get or restore the signer
    const signer = getSigner();
    
    // If signer isn't connected but we have auth state, it should restore automatically
    // via the constructor. If still not connected, something is wrong.
    if (!signer.isConnected()) {
      throw new Error('Failed to restore Nostr connection. Try shakespeare_connect again.');
    }

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || 'GET';
    
    // Get payload for POST/PUT requests
    let payload: Record<string, any> | undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        payload = JSON.parse(init.body);
      } catch {
        // Not JSON, skip payload
      }
    }

    // Generate NIP-98 token using nostr-tools
    const token = await getToken(
      url,
      method,
      (event) => signer.signEvent(event),
      true, // Include "Nostr " scheme
      payload
    );

    const headers = new Headers(init?.headers);
    headers.set('Authorization', token);

    return fetch(input, {
      ...init,
      headers,
    });
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
   * Loader that returns a NIP-98 authenticated fetch function and sets up models
   * Uses our NIP-46 signer instead of requiring an nsec
   */
  async loader(_getAuth: () => Promise<any>, provider: any) {
    // Ensure provider object exists with models
    if (provider) {
      provider.models = provider.models || {};
      
      // Fetch and add models to the provider
      try {
        const baseURL = provider?.options?.baseURL || SHAKESPEARE_BASE_URL;
        const response = await fetch(`${baseURL}/models`, {
          signal: AbortSignal.timeout(5000),
        });

        const { data } = await response.json();

        // Add models with full metadata required by OpenCode
        for (const model of data) {
          if (!model.type || model.type === 'chat') {
            provider.models[model.id] = {
              id: model.id,
              providerID: 'shakespeare',
              api: {
                id: model.id,
                url: baseURL,
                npm: '@ai-sdk/openai-compatible',
              },
              name: model.name,
              capabilities: {
                temperature: true,
                reasoning: false,
                attachment: true,
                toolcall: true,
                input: { text: true, audio: false, image: true, video: false, pdf: false },
                output: { text: true, audio: false, image: false, video: false, pdf: false },
                interleaved: false,
              },
              cost: {
                input: parseFloat(model.pricing?.prompt) || 0,
                output: parseFloat(model.pricing?.completion) || 0,
                cache: { read: 0, write: 0 },
              },
              limit: {
                context: model.context_window || 128000,
                output: 8192,
              },
              status: 'active' as const,
              options: {},
              headers: {},
              release_date: new Date().toISOString().split('T')[0],
              variants: {},
            };
          }
        }
    } catch {
      // Ignore errors - models are loaded via config hook
    }
    }

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
