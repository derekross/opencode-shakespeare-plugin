/**
 * NIP-46 Remote Signer using nostr-tools BunkerSigner
 * 
 * Wraps BunkerSigner with state persistence and a simple API
 * for use by Shakespeare tools.
 */

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { BunkerSigner } from 'nostr-tools/nip46';
import { SimplePool } from 'nostr-tools/pool';

/**
 * Suppress all console output during nostr-tools operations
 * to prevent relay NOTICE/disconnect messages from polluting the UI
 */
function suppressConsole(): () => void {
  const originalDebug = console.debug;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  console.debug = () => {};
  console.warn = () => {};
  console.log = () => {};
  
  return () => {
    console.debug = originalDebug;
    console.warn = originalWarn;
    console.log = originalLog;
  };
}

/**
 * Create a nostrconnect:// URI manually
 * (createNostrConnectURI was added in nostr-tools 2.19+, so we build it ourselves for compatibility)
 */
function createNostrConnectURI(params: {
  clientPubkey: string;
  relays: string[];
  secret: string;
  name?: string;
  perms?: string[];
}): string {
  const searchParams = new URLSearchParams();
  
  for (const relay of params.relays) {
    searchParams.append('relay', relay);
  }
  
  searchParams.set('secret', params.secret);
  
  if (params.name) {
    searchParams.set('name', params.name);
  }
  
  if (params.perms && params.perms.length > 0) {
    searchParams.set('perms', params.perms.join(','));
  }
  
  return `nostrconnect://${params.clientPubkey}?${searchParams.toString()}`;
}
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { loadAuthState, saveAuthState, clearAuthState, type AuthState, savePendingConnection, loadPendingConnection, clearPendingConnection, type PendingConnectionState } from './storage.js';
import { displayQRCode, formatConnectionInstructions } from './qrcode.js';

/** Default relays for NIP-46 communication */
export const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
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
 * Signer status information
 */
export interface SignerStatus {
  connected: boolean;
  userPubkey: string | null;
  npub: string | null;
  relays: string[];
}

/**
 * Pending connection state for two-step connect flow (in-memory)
 */
interface PendingConnection {
  clientSecretKey: Uint8Array;
  nostrconnectUri: string;
  relays: string[];
}

/**
 * Load pending connection from disk and convert to in-memory format
 */
function loadPendingConnectionFromDisk(): PendingConnection | null {
  const state = loadPendingConnection();
  if (!state) return null;
  
  try {
    const decoded = nip19.decode(state.clientSecretKey);
    if (decoded.type === 'nsec') {
      return {
        clientSecretKey: decoded.data,
        nostrconnectUri: state.nostrconnectUri,
        relays: state.relays,
      };
    }
  } catch {
    // Invalid state, clear it
    clearPendingConnection();
  }
  return null;
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
    // Try to restore from saved state
    this.restoreCredentials();
  }

  /**
   * Restore signer state from disk
   */
  private restoreCredentials(): boolean {
    const state = loadAuthState();
    
    if (state) {
      try {
        const decoded = nip19.decode(state.clientSecretKey);
        
        if (decoded.type === 'nsec') {
          this.clientSecretKey = decoded.data;
          this.userPubkey = state.userPubkey;
          this.relays = state.relays;
          
          // Recreate BunkerSigner from stored state
          const bunkerPointer = {
            pubkey: state.bunkerPubkey,
            relays: state.relays,
            secret: null,
          };
          
          // Try fromBunker (nostr-tools 2.19+), fall back to constructor (2.15-2.18)
          if (typeof (BunkerSigner as any).fromBunker === 'function') {
            this.bunkerSigner = (BunkerSigner as any).fromBunker(
              this.clientSecretKey,
              bunkerPointer,
              { pool: this.pool }
            );
          } else {
            this.bunkerSigner = new (BunkerSigner as any)(
              this.clientSecretKey,
              bunkerPointer,
              { pool: this.pool }
            );
          }
          
          return true;
        }
      } catch {
        // BunkerSigner creation may fail, but still restore basic state
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
            // Ignore secondary error
          }
        }
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
    
    const bunkerPointer = {
      pubkey: state.bunkerPubkey,
      relays: state.relays,
      secret: null,
    };
    
    // Try fromBunker (nostr-tools 2.19+), fall back to constructor (2.15-2.18)
    if (typeof (BunkerSigner as any).fromBunker === 'function') {
      this.bunkerSigner = (BunkerSigner as any).fromBunker(
        this.clientSecretKey,
        bunkerPointer,
        { pool: this.pool }
      );
    } else {
      // Older versions have public constructor
      this.bunkerSigner = new (BunkerSigner as any)(
        this.clientSecretKey,
        bunkerPointer,
        { pool: this.pool }
      );
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
      await this.bunkerSigner.close();
      this.bunkerSigner = null;
    }

    this.clientSecretKey = null;
    this.userPubkey = null;

    // Clear persisted state
    clearAuthState();
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
    const clientPubkey = getPublicKey(this.clientSecretKey);
    const secret = generateSecret();

    // Build nostrconnect:// URI
    const nostrconnectUri = createNostrConnectURI({
      clientPubkey,
      relays: this.relays,
      secret,
      name: 'Shakespeare',
      perms: ['sign_event'],
    });

    // Generate QR code
    const qrString = await displayQRCode(nostrconnectUri, { small: false });
    const output = formatConnectionInstructions(nostrconnectUri, qrString);

    // Note: QR code output is returned, not printed here

    try {
      // Wait for bunker to connect
      this.bunkerSigner = await BunkerSigner.fromURI(
        this.clientSecretKey,
        nostrconnectUri,
        { pool: this.pool },
        CONNECTION_TIMEOUT
      );

      // Get the user's public key
      this.userPubkey = await this.bunkerSigner.getPublicKey();

      // Save state for persistence
      const state: AuthState = {
        clientSecretKey: nip19.nsecEncode(this.clientSecretKey),
        clientPubkey,
        bunkerPubkey: this.userPubkey, // BunkerSigner uses user pubkey
        userPubkey: this.userPubkey,
        relays: this.relays,
        connectedAt: Date.now(),
        permissions: ['sign_event'],
      };
      saveAuthState(state);

      return `${output}\n\nConnected successfully!\nUser pubkey: ${this.getUserNpub()}`;
    } catch (error) {
      // Clean up on failure
      this.clientSecretKey = null;
      this.bunkerSigner = null;
      throw error;
    }
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

    // Build nostrconnect:// URI
    const nostrconnectUri = createNostrConnectURI({
      clientPubkey,
      relays: this.relays,
      secret,
      name: 'Shakespeare',
      perms: ['sign_event'],
    });

    // Save pending connection state (both in-memory and to disk)
    this.pendingConnection = {
      clientSecretKey,
      nostrconnectUri,
      relays: this.relays,
    };
    
    // Persist to disk so it survives process restarts
    savePendingConnection({
      clientSecretKey: nip19.nsecEncode(clientSecretKey),
      nostrconnectUri,
      relays: this.relays,
      createdAt: Date.now(),
    });

    // Generate QR code
    const qrString = await displayQRCode(nostrconnectUri, { small: false });
    return formatConnectionInstructions(nostrconnectUri, qrString);
  }

  /**
   * Check if there's a pending connection waiting to be completed
   */
  hasPendingConnection(): boolean {
    // Check in-memory first, then disk
    if (this.pendingConnection !== null) return true;
    return loadPendingConnection() !== null;
  }

  /**
   * Complete a pending connection (step 2 of two-step flow)
   */
  async completeConnection(timeoutMs: number = CONNECTION_TIMEOUT): Promise<string> {
    // Try to load from memory first, then from disk
    let pending = this.pendingConnection;
    if (!pending) {
      pending = loadPendingConnectionFromDisk();
    }
    
    if (!pending) {
      throw new Error('No pending connection. Run shakespeare_connect first.');
    }

    const { clientSecretKey, nostrconnectUri, relays } = pending;
    
    try {
      // Wait for bunker to connect
      this.bunkerSigner = await BunkerSigner.fromURI(
        clientSecretKey,
        nostrconnectUri,
        { pool: this.pool },
        timeoutMs
      );

      // Get the user's public key
      this.userPubkey = await this.bunkerSigner.getPublicKey();
      this.clientSecretKey = clientSecretKey;
      this.relays = relays;

      // Save state for persistence
      const state: AuthState = {
        clientSecretKey: nip19.nsecEncode(clientSecretKey),
        clientPubkey: getPublicKey(clientSecretKey),
        bunkerPubkey: this.userPubkey,
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
      // Clear pending on failure (both in-memory and disk)
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
    
    const signedEvent = await this.bunkerSigner!.signEvent(eventTemplate);
    return signedEvent;
    // Note: We don't close connections here anymore because:
    // 1. It breaks subsequent signing attempts
    // 2. The relay ping timeouts are less disruptive than broken signing
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
