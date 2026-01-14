/**
 * Storage module for Shakespeare auth persistence
 * Stores NIP-46 connection state in ~/.config/shakespeare/auth.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AuthState {
  /** Client's secret key (nsec format) for relay communication */
  clientSecretKey: string;
  /** Client's public key (hex) */
  clientPubkey: string;
  /** Remote signer's public key (hex) */
  bunkerPubkey: string;
  /** User's actual public key (hex) - may differ from bunkerPubkey */
  userPubkey: string;
  /** Relays used for NIP-46 communication */
  relays: string[];
  /** Timestamp when connection was established */
  connectedAt: number;
  /** Permissions granted by the bunker */
  permissions: string[];
}

const CONFIG_DIR = join(homedir(), '.config', 'shakespeare');
const AUTH_FILE = join(CONFIG_DIR, 'auth.json');

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load stored auth state
 * @returns Auth state if exists, null otherwise
 */
export function loadAuthState(): AuthState | null {
  try {
    if (!existsSync(AUTH_FILE)) {
      return null;
    }
    const data = readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(data) as AuthState;
  } catch {
    return null;
  }
}

/**
 * Save auth state to disk
 * @param state - Auth state to persist
 */
export function saveAuthState(state: AuthState): void {
  ensureConfigDir();
  writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Clear stored auth state (disconnect)
 * @returns true if state was cleared, false if no state existed
 */
export function clearAuthState(): boolean {
  try {
    if (existsSync(AUTH_FILE)) {
      unlinkSync(AUTH_FILE);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return loadAuthState() !== null;
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the auth file path
 */
export function getAuthFilePath(): string {
  return AUTH_FILE;
}

export interface PendingConnection {
  clientSecretKey: string;
  clientPubkey: string;
  nostrconnectUri: string;
  relays: string[];
}

const PENDING_FILE = join(CONFIG_DIR, 'pending.json');

/**
 * Save pending connection state
 */
export function savePendingConnection(pending: PendingConnection): void {
  ensureConfigDir();
  writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2), 'utf-8');
}

/**
 * Load pending connection state
 */
export function loadPendingConnection(): PendingConnection | null {
  try {
    if (!existsSync(PENDING_FILE)) {
      return null;
    }
    const data = readFileSync(PENDING_FILE, 'utf-8');
    return JSON.parse(data) as PendingConnection;
  } catch {
    return null;
  }
}

/**
 * Clear pending connection state
 */
export function clearPendingConnection(): void {
  try {
    if (existsSync(PENDING_FILE)) {
      unlinkSync(PENDING_FILE);
    }
  } catch {
    // Ignore errors
  }
}
