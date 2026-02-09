/**
 * NIP-46 Remote Signer using nostr-tools BunkerSigner
 * 
 * Wraps BunkerSigner with state persistence and a simple API
 * for use by Shakespeare tools.
 */

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { BunkerSigner, createNostrConnectURI } from 'nostr-tools/nip46';
import { SimplePool } from 'nostr-tools/pool';
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { loadAuthState, saveAuthState, clearAuthState, savePendingConnection, loadPendingConnection, clearPendingConnection, type AuthState } from './storage.js';
import { displayQRCode, formatConnectionInstructions } from './qrcode.js';

/** Default relays for NIP-46 communication */
export const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
];

/** Connection timeout in milliseconds (5 minutes) */
const CONNECTION_TIMEOUT = 5 * 60 * 1000;

/**
 * Generate a random secret for nostrconnect
 */
function generateSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Suppress noisy console.debug messages from nostr-tools relay code
 * during a synchronous block. Returns a restore function.
 */
function suppressDebug(): () => void {
  const original = console.debug;
  console.debug = () => {};
  return () => { console.debug = original; };
}

/**
 * Signer status information
 */
export interface SignerStatus {
  connected: boolean;
  userPubkey: string | null;
  npub: string | null;
  relays: string[];
}

/**
 * Pending connection state for two-step connect flow
 */
interface PendingConnection {
  clientSecretKey: Uint8Array;
  nostrconnectUri: string;
  relays: string[];
}

/**
 * Shakespeare Signer - manages NIP-46 remote signing using BunkerSigner
 */
export class ShakespeareSigner {
  private bunkerSigner: BunkerSigner | null = null;
  private pool: SimplePool;
  private clientSecretKey: Uint8Array | null = null;
  private userPubkey: string | null = null;
  private relays: string[] = DEFAULT_RELAYS;
  private pendingConnection: PendingConnection | null = null;

  constructor() {
    this.pool = new SimplePool();
    this.restore();
  }

  /**
   * Restore signer state from disk (auth state or pending connection)
   */
  private restore(): boolean {
    // First try to restore a completed auth session
    const state = loadAuthState();
    
    if (state) {
      try {
        const decoded = nip19.decode(state.clientSecretKey);
        
        if (decoded.type === 'nsec') {
          this.clientSecretKey = decoded.data;
          this.userPubkey = state.userPubkey;
          this.relays = state.relays;
          
          // Recreate BunkerSigner from stored state
          const restoreDebug = suppressDebug();
          try {
            this.bunkerSigner = BunkerSigner.fromBunker(
              this.clientSecretKey,
              {
                pubkey: state.bunkerPubkey,
                relays: state.relays,
                secret: null,
              },
              { pool: this.pool }
            );
          } finally {
            restoreDebug();
          }
          
          return true;
        }
      } catch {
        // If BunkerSigner creation fails, still restore basic state
        // so isConnected() returns true based on saved credentials
        if (state.userPubkey && state.clientSecretKey) {
          try {
            const decoded = nip19.decode(state.clientSecretKey);
            if (decoded.type === 'nsec') {
              this.clientSecretKey = decoded.data;
              this.userPubkey = state.userPubkey;
              this.relays = state.relays;
              return true;
            }
          } catch {
            // Ignore secondary decode error
          }
        }
      }
    }

    // Try to restore a pending connection from disk
    const pending = loadPendingConnection();
    if (pending) {
      try {
        const decoded = nip19.decode(pending.clientSecretKey);
        if (decoded.type === 'nsec') {
          this.pendingConnection = {
            clientSecretKey: decoded.data,
            nostrconnectUri: pending.nostrconnectUri,
            relays: pending.relays,
          };
        }
      } catch {
        // Invalid pending state, clear it
        clearPendingConnection();
      }
    }

    return false;
  }

  /**
   * Check if the signer is connected (has credentials to sign)
   */
  isConnected(): boolean {
    return this.userPubkey !== null && this.clientSecretKey !== null;
  }
  
  /**
   * Ensure bunkerSigner is available, creating it lazily if needed
   */
  private ensureBunkerSigner(): void {
    if (this.bunkerSigner) return;
    
    if (!this.clientSecretKey || !this.userPubkey) {
      throw new Error('Not connected. Use shakespeare_connect first.');
    }
    
    const state = loadAuthState();
    if (!state) {
      throw new Error('No auth state found. Use shakespeare_connect first.');
    }
    
    const restoreDebug = suppressDebug();
    try {
      this.bunkerSigner = BunkerSigner.fromBunker(
        this.clientSecretKey,
        {
          pubkey: state.bunkerPubkey,
          relays: state.relays,
          secret: null,
        },
        { pool: this.pool }
      );
    } finally {
      restoreDebug();
    }
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
    if (this.bunkerSigner) {
      try {
        await this.bunkerSigner.close();
      } catch {
        // Ignore close errors (relay may already be disconnected)
      }
      this.bunkerSigner = null;
    }

    this.clientSecretKey = null;
    this.userPubkey = null;
    this.pendingConnection = null;

    // Clear all persisted state
    clearAuthState();
    clearPendingConnection();
  }

  /**
   * Initiate connection (step 1 of two-step flow)
   * Returns QR code and saves pending state, but doesn't wait for completion
   */
  async initiateConnection(customRelays?: string[]): Promise<string> {
    if (customRelays && customRelays.length > 0) {
      this.relays = customRelays;
    }

    // Generate new client keypair
    const clientSecretKey = generateSecretKey();
    const clientPubkey = getPublicKey(clientSecretKey);
    const secret = generateSecret();

    // Build nostrconnect:// URI using nostr-tools native function
    const nostrconnectUri = createNostrConnectURI({
      clientPubkey,
      relays: this.relays,
      secret,
      name: 'Shakespeare',
      perms: ['sign_event'],
    });

    // Save pending connection state (both in-memory and disk)
    this.pendingConnection = {
      clientSecretKey,
      nostrconnectUri,
      relays: this.relays,
    };

    savePendingConnection({
      clientSecretKey: nip19.nsecEncode(clientSecretKey),
      clientPubkey,
      nostrconnectUri,
      relays: this.relays,
    });

    // Generate QR code (small format for terminal)
    const qrString = await displayQRCode(nostrconnectUri, { small: true });
    return formatConnectionInstructions(nostrconnectUri, qrString);
  }

  /**
   * Check if there's a pending connection waiting to be completed
   */
  hasPendingConnection(): boolean {
    return this.pendingConnection !== null;
  }

  /**
   * Complete a pending connection (step 2 of two-step flow)
   */
  async completeConnection(timeoutMs: number = CONNECTION_TIMEOUT): Promise<string> {
    if (!this.pendingConnection) {
      throw new Error('No pending connection. Run shakespeare_connect first.');
    }

    const { clientSecretKey, nostrconnectUri, relays } = this.pendingConnection;
    
    try {
      // Wait for bunker to connect
      this.bunkerSigner = await BunkerSigner.fromURI(
        clientSecretKey,
        nostrconnectUri,
        { pool: this.pool },
        timeoutMs
      );

      // Get the user's public key (may differ from bunker pubkey)
      this.userPubkey = await this.bunkerSigner.getPublicKey();
      this.clientSecretKey = clientSecretKey;
      this.relays = relays;

      // The bunker pubkey is the pubkey of the NIP-46 signer service
      // (may be the same as userPubkey for apps like Amber, but differs for dedicated bunkers)
      const bunkerPubkey = this.bunkerSigner.bp.pubkey;

      // Save state for persistence
      const state: AuthState = {
        clientSecretKey: nip19.nsecEncode(clientSecretKey),
        clientPubkey: getPublicKey(clientSecretKey),
        bunkerPubkey,
        userPubkey: this.userPubkey,
        relays: this.relays,
        connectedAt: Date.now(),
        permissions: ['sign_event'],
      };
      saveAuthState(state);

      // Clear pending connection (both in-memory and disk)
      this.pendingConnection = null;
      clearPendingConnection();

      return `Connected successfully!\nUser pubkey: ${this.getUserNpub()}`;
    } catch (error) {
      // Clear pending on failure
      this.pendingConnection = null;
      clearPendingConnection();
      throw error;
    }
  }

  /**
   * Sign a Nostr event using the remote signer
   */
  async signEvent(eventTemplate: EventTemplate): Promise<VerifiedEvent> {
    this.ensureBunkerSigner();
    
    const restoreDebug = suppressDebug();
    try {
      return await this.bunkerSigner!.signEvent(eventTemplate);
    } finally {
      restoreDebug();
    }
  }

  /**
   * Get connection status info
   */
  getStatus(): SignerStatus {
    return {
      connected: this.isConnected(),
      userPubkey: this.userPubkey,
      npub: this.getUserNpub(),
      relays: this.relays,
    };
  }

  /**
   * Publish a signed event to relays
   */
  async publishEvent(event: VerifiedEvent): Promise<{ success: number; total: number }> {
    let success = 0;
    const results = await Promise.allSettled(
      this.pool.publish(this.relays, event)
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        success++;
      }
    }

    return { success, total: this.relays.length };
  }

  /**
   * Publish multiple events to relays
   */
  async publishEvents(events: VerifiedEvent[]): Promise<{ success: number; total: number }> {
    let success = 0;
    const total = events.length * this.relays.length;

    for (const event of events) {
      const results = await Promise.allSettled(
        this.pool.publish(this.relays, event)
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          success++;
        }
      }
    }

    return { success, total };
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
