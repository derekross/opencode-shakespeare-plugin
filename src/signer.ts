/**
 * NIP-46 Remote Signer implementation
 * Handles the nostrconnect:// flow for client-initiated connections
 */

import { generateSecretKey, getPublicKey, nip19, nip44, finalizeEvent, type EventTemplate, type NostrEvent } from 'nostr-tools';
import { Relay } from 'nostr-tools/relay';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { loadAuthState, saveAuthState, clearAuthState, type AuthState } from './storage.js';
import { displayQRCode, formatConnectionInstructions } from './qrcode.js';

/** Default relays for NIP-46 communication */
export const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
];

/** Connection timeout in milliseconds (5 minutes) */
const CONNECTION_TIMEOUT = 5 * 60 * 1000;

/** NIP-46 request/response kind */
const NIP46_KIND = 24133;

interface NIP46Request {
  id: string;
  method: string;
  params: string[];
}

interface NIP46Response {
  id: string;
  result?: string;
  error?: string;
}

/**
 * Generate a random request ID
 */
function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Generate a random secret for nostrconnect
 */
function generateSecret(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Shakespeare Signer - manages NIP-46 remote signing
 */
export class ShakespeareSigner {
  private clientSecretKey: Uint8Array | null = null;
  private clientPubkey: string | null = null;
  private bunkerPubkey: string | null = null;
  private userPubkey: string | null = null;
  private relays: string[] = DEFAULT_RELAYS;
  private connectedRelays: Map<string, Relay> = new Map();

  constructor() {
    // Try to restore from saved state
    this.restore();
  }

  /**
   * Restore signer state from disk
   */
  private restore(): boolean {
    const state = loadAuthState();
    if (state) {
      try {
        const decoded = nip19.decode(state.clientSecretKey);
        if (decoded.type === 'nsec') {
          this.clientSecretKey = decoded.data;
          this.clientPubkey = state.clientPubkey;
          this.bunkerPubkey = state.bunkerPubkey;
          this.userPubkey = state.userPubkey;
          this.relays = state.relays;
          return true;
        }
      } catch {
        // Invalid stored state, clear it
        clearAuthState();
      }
    }
    return false;
  }

  /**
   * Check if the signer is connected
   */
  isConnected(): boolean {
    return this.clientSecretKey !== null && this.bunkerPubkey !== null && this.userPubkey !== null;
  }

  /**
   * Get the user's public key (hex)
   */
  getUserPubkey(): string | null {
    return this.userPubkey;
  }

  /**
   * Get the user's public key as npub
   */
  getUserNpub(): string | null {
    if (!this.userPubkey) return null;
    return nip19.npubEncode(this.userPubkey);
  }

  /**
   * Get configured relays
   */
  getRelays(): string[] {
    return [...this.relays];
  }

  /**
   * Set relays to use
   */
  setRelays(relays: string[]): void {
    this.relays = relays.length > 0 ? relays : DEFAULT_RELAYS;
  }

  /**
   * Disconnect and clear stored credentials
   */
  async disconnect(): Promise<void> {
    // Close all relay connections
    for (const relay of this.connectedRelays.values()) {
      relay.close();
    }
    this.connectedRelays.clear();

    // Clear state
    this.clientSecretKey = null;
    this.clientPubkey = null;
    this.bunkerPubkey = null;
    this.userPubkey = null;

    // Clear persisted state
    clearAuthState();
  }

  /**
   * Connect to relays
   */
  private async connectToRelays(): Promise<Relay[]> {
    const connected: Relay[] = [];

    for (const url of this.relays) {
      try {
        if (this.connectedRelays.has(url)) {
          connected.push(this.connectedRelays.get(url)!);
          continue;
        }

        const relay = await Relay.connect(url);
        this.connectedRelays.set(url, relay);
        connected.push(relay);
      } catch (error) {
        console.error(`Failed to connect to ${url}:`, error);
      }
    }

    if (connected.length === 0) {
      throw new Error('Failed to connect to any relay');
    }

    return connected;
  }

  /**
   * Encrypt a message using NIP-44
   */
  private encrypt(plaintext: string, recipientPubkey: string): string {
    if (!this.clientSecretKey) throw new Error('No client secret key');
    const conversationKey = nip44.getConversationKey(this.clientSecretKey, recipientPubkey);
    return nip44.encrypt(plaintext, conversationKey);
  }

  /**
   * Decrypt a message using NIP-44
   */
  private decrypt(ciphertext: string, senderPubkey: string): string {
    if (!this.clientSecretKey) throw new Error('No client secret key');
    const conversationKey = nip44.getConversationKey(this.clientSecretKey, senderPubkey);
    return nip44.decrypt(ciphertext, conversationKey);
  }

  /**
   * Send a NIP-46 request and wait for response
   */
  private async sendRequest(method: string, params: string[], relays: Relay[]): Promise<string> {
    if (!this.clientSecretKey || !this.clientPubkey || !this.bunkerPubkey) {
      throw new Error('Signer not connected');
    }

    const requestId = generateRequestId();
    const request: NIP46Request = { id: requestId, method, params };
    const encrypted = this.encrypt(JSON.stringify(request), this.bunkerPubkey);

    const template: EventTemplate = {
      kind: NIP46_KIND,
      content: encrypted,
      tags: [['p', this.bunkerPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    };

    const event = finalizeEvent(template, this.clientSecretKey);

    // Publish to all relays
    await Promise.all(relays.map(relay => relay.publish(event)));

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 30000); // 30 second timeout for requests

      for (const relay of relays) {
        const sub = relay.subscribe(
          [{ kinds: [NIP46_KIND], '#p': [this.clientPubkey!], authors: [this.bunkerPubkey!] }],
          {
            onevent: (responseEvent: NostrEvent) => {
              try {
                const decrypted = this.decrypt(responseEvent.content, responseEvent.pubkey);
                const response: NIP46Response = JSON.parse(decrypted);

                if (response.id === requestId) {
                  clearTimeout(timeout);
                  sub.close();

                  if (response.error) {
                    reject(new Error(response.error));
                  } else {
                    resolve(response.result || '');
                  }
                }
              } catch {
                // Ignore decryption/parse errors from other messages
              }
            },
          }
        );
      }
    });
  }

  /**
   * Initiate connection using nostrconnect:// flow (client-initiated)
   * Returns formatted output for display
   */
  async connect(customRelays?: string[]): Promise<string> {
    if (customRelays && customRelays.length > 0) {
      this.relays = customRelays;
    }

    // Generate new client keypair
    this.clientSecretKey = generateSecretKey();
    this.clientPubkey = getPublicKey(this.clientSecretKey);

    const secret = generateSecret();

    // Build nostrconnect:// URI
    const relayParams = this.relays.map(r => `relay=${encodeURIComponent(r)}`).join('&');
    const nostrconnectUri = `nostrconnect://${this.clientPubkey}?${relayParams}&secret=${secret}&name=Shakespeare&perms=sign_event`;

    // Generate QR code
    const qrString = await displayQRCode(nostrconnectUri, { small: false });
    const output = formatConnectionInstructions(nostrconnectUri, qrString);

    // Connect to relays
    const relays = await this.connectToRelays();

    // Wait for connect response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout - no response from bunker within 5 minutes'));
      }, CONNECTION_TIMEOUT);

      for (const relay of relays) {
        const sub = relay.subscribe(
          [{ kinds: [NIP46_KIND], '#p': [this.clientPubkey!] }],
          {
            onevent: async (event: NostrEvent) => {
              try {
                const decrypted = this.decrypt(event.content, event.pubkey);
                const response: NIP46Response = JSON.parse(decrypted);

                // Check if this is a connect response with our secret
                if (response.result === secret || response.result === 'ack') {
                  clearTimeout(timeout);
                  sub.close();

                  // Store bunker pubkey from event author
                  this.bunkerPubkey = event.pubkey;

                  // Get the user's actual public key
                  try {
                    this.userPubkey = await this.sendRequest('get_public_key', [], relays);
                  } catch {
                    // If get_public_key fails, assume bunker pubkey is user pubkey
                    this.userPubkey = this.bunkerPubkey;
                  }

                  // Save state
                  const state: AuthState = {
                    clientSecretKey: nip19.nsecEncode(this.clientSecretKey!),
                    clientPubkey: this.clientPubkey!,
                    bunkerPubkey: this.bunkerPubkey,
                    userPubkey: this.userPubkey,
                    relays: this.relays,
                    connectedAt: Date.now(),
                    permissions: ['sign_event'],
                  };
                  saveAuthState(state);

                  resolve(`${output}\n\nConnected successfully!\nUser pubkey: ${this.getUserNpub()}`);
                }
              } catch {
                // Ignore decryption/parse errors
              }
            },
          }
        );
      }

      // Print the QR code output immediately so user can scan
      console.log(output);
    });
  }

  /**
   * Sign a Nostr event using the remote signer
   */
  async signEvent(eventTemplate: EventTemplate): Promise<NostrEvent> {
    if (!this.isConnected()) {
      throw new Error('Not connected. Use shakespeare_connect first.');
    }

    const relays = await this.connectToRelays();

    // Add pubkey to template
    const templateWithPubkey = {
      ...eventTemplate,
      pubkey: this.userPubkey!,
    };

    const result = await this.sendRequest('sign_event', [JSON.stringify(templateWithPubkey)], relays);
    return JSON.parse(result) as NostrEvent;
  }

  /**
   * Get connection status info
   */
  getStatus(): { connected: boolean; userPubkey: string | null; npub: string | null; relays: string[] } {
    return {
      connected: this.isConnected(),
      userPubkey: this.userPubkey,
      npub: this.getUserNpub(),
      relays: this.relays,
    };
  }

  /**
   * Publish a signed event to connected relays
   */
  async publishEvent(event: NostrEvent): Promise<{ success: number; total: number }> {
    const relays = await this.connectToRelays();
    let success = 0;

    await Promise.all(
      relays.map(async (relay) => {
        try {
          await relay.publish(event);
          success++;
        } catch {
          // Failed to publish to this relay
        }
      })
    );

    return { success, total: relays.length };
  }

  /**
   * Publish multiple events to connected relays
   */
  async publishEvents(events: NostrEvent[]): Promise<{ success: number; total: number }> {
    const relays = await this.connectToRelays();
    let success = 0;

    for (const event of events) {
      await Promise.all(
        relays.map(async (relay) => {
          try {
            await relay.publish(event);
            success++;
          } catch {
            // Failed to publish to this relay
          }
        })
      );
    }

    return { success, total: relays.length * events.length };
  }
}

// Singleton instance
let signerInstance: ShakespeareSigner | null = null;

/**
 * Get the singleton signer instance
 */
export function getSigner(): ShakespeareSigner {
  if (!signerInstance) {
    signerInstance = new ShakespeareSigner();
  }
  return signerInstance;
}
