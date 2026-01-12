/**
 * shakespeare_sign_event tool
 * Sign a Nostr event using the remote signer
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner } from '../signer.js';
import type { EventTemplate } from 'nostr-tools';

export const sign = tool({
  description: 'Sign a Nostr event using the connected NIP-46 remote signer. Requires an active connection (use shakespeare_connect first). The event will be signed by the user\'s private key held in their bunker app.',
  args: {
    kind: tool.schema.number().describe('The Nostr event kind number'),
    content: tool.schema.string().describe('The event content'),
    tags: tool.schema.string().optional().describe('JSON array of tags, e.g., [["p", "pubkey"], ["e", "eventid"]]'),
    created_at: tool.schema.number().optional().describe('Unix timestamp. Defaults to current time if not provided.'),
  },
  async execute(args) {
    const signer = getSigner();

    if (!signer.isConnected()) {
      return JSON.stringify({
        error: 'Not connected. Use shakespeare_connect first to authenticate.',
        success: false,
      });
    }

    try {
      // Parse tags if provided
      let tags: string[][] = [];
      if (args.tags) {
        try {
          tags = JSON.parse(args.tags);
          if (!Array.isArray(tags)) {
            return JSON.stringify({
              error: 'Tags must be a JSON array',
              success: false,
            });
          }
        } catch {
          return JSON.stringify({
            error: 'Invalid tags JSON format',
            success: false,
          });
        }
      }

      const template: EventTemplate = {
        kind: args.kind,
        content: args.content,
        tags,
        created_at: args.created_at ?? Math.floor(Date.now() / 1000),
      };

      const signedEvent = await signer.signEvent(template);

      return JSON.stringify({
        success: true,
        event: signedEvent,
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return JSON.stringify({
        error: `Signing failed: ${message}`,
        success: false,
      });
    }
  },
});
