/**
 * Shared utility for updating OpenCode's auth.json
 * 
 * OpenCode stores provider auth state in ~/.local/share/opencode/auth.json.
 * After NIP-46 connection, we write a dummy API key there so OpenCode
 * recognizes the Shakespeare provider as authenticated.
 */

import { xdgData } from 'xdg-basedir';
import fs from 'node:fs/promises';
import path from 'node:path';

/** The dummy API key that indicates NIP-46 authentication is active */
const AUTH_KEY = 'nostr-nip46-connected';

/**
 * Read and parse OpenCode's auth.json, returning an empty object on failure
 */
async function readAuthFile(authPath: string): Promise<Record<string, unknown>> {
  try {
    const text = await fs.readFile(authPath, 'utf-8');
    const data = JSON.parse(text);
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}

/**
 * Mark Shakespeare as authenticated in OpenCode's auth.json
 */
export async function updateOpencodeAuth(): Promise<void> {
  if (!xdgData) return;
  
  const authPath = path.join(xdgData, 'opencode', 'auth.json');
  const data = await readAuthFile(authPath);
  
  data['shakespeare'] = { type: 'api', key: AUTH_KEY };
  await fs.mkdir(path.dirname(authPath), { recursive: true });
  await fs.writeFile(authPath, JSON.stringify(data, null, 2));
}

/**
 * Remove Shakespeare auth from OpenCode's auth.json
 */
export async function clearOpencodeAuth(): Promise<void> {
  if (!xdgData) return;
  
  const authPath = path.join(xdgData, 'opencode', 'auth.json');
  const data = await readAuthFile(authPath);
  
  delete data['shakespeare'];
  await fs.writeFile(authPath, JSON.stringify(data, null, 2));
}
