/**
 * shakespeare_ngit tool
 * Publishes/pushes to Nostr Git (NIP-34)
 * 
 * This tool publishes repository state to Nostr using NIP-34:
 * - Kind 30617: Repository announcement (clone URLs, relays, metadata)
 * - Kind 30618: Repository state (branches, tags, HEAD)
 * 
 * If the `ngit` CLI is installed, it will be used to handle the full push flow
 * including git object transfer. Otherwise, only Nostr events are published.
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner, DEFAULT_RELAYS } from '../signer.js';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { nip19 } from 'nostr-tools';

// Default GRASP servers for ngit
const DEFAULT_GRASP_SERVERS = [
  'wss://git.shakespeare.diy',
  'wss://relay.ngit.dev',
];

interface RepoState {
  identifier: string;
  branches: { name: string; sha: string }[];
  tags: { name: string; sha: string }[];
  head: string;
}

/**
 * Check if ngit CLI is installed
 */
function isNgitInstalled(): boolean {
  try {
    execSync('ngit --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git repository state
 */
function getRepoState(projectPath: string): RepoState {
  const gitDir = path.join(projectPath, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error('Not a git repository. Run "git init" first.');
  }

  // Get current branch/HEAD
  let head: string;
  try {
    const headRef = execSync('git symbolic-ref HEAD 2>/dev/null || git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    head = headRef.startsWith('refs/') ? `ref: ${headRef}` : headRef;
  } catch {
    head = 'ref: refs/heads/main';
  }

  // Get all branches
  const branches: { name: string; sha: string }[] = [];
  try {
    const branchOutput = execSync('git for-each-ref --format="%(refname:short) %(objectname)" refs/heads/', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const line of branchOutput.trim().split('\n')) {
      if (line) {
        const [name, sha] = line.split(' ');
        if (name && sha) {
          branches.push({ name, sha });
        }
      }
    }
  } catch {
    // No branches yet
  }

  // Get all tags
  const tags: { name: string; sha: string }[] = [];
  try {
    const tagOutput = execSync('git for-each-ref --format="%(refname:short) %(objectname)" refs/tags/', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const line of tagOutput.trim().split('\n')) {
      if (line) {
        const [name, sha] = line.split(' ');
        if (name && sha) {
          tags.push({ name, sha });
        }
      }
    }
  } catch {
    // No tags
  }

  // Generate identifier from directory name
  let identifier = path.basename(projectPath);

  // Convert to kebab-case
  identifier = identifier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return { identifier, branches, tags, head };
}

/**
 * Create a NIP-34 repository announcement event (kind 30617)
 */
function createRepoAnnouncementEvent(data: {
  repoId: string;
  name?: string;
  description?: string;
  cloneUrls: string[];
  relays: string[];
  webUrls?: string[];
}): { kind: number; content: string; tags: string[][]; created_at: number } {
  const tags: string[][] = [
    ['d', data.repoId],
  ];

  if (data.name) {
    tags.push(['name', data.name]);
  }

  if (data.description) {
    tags.push(['description', data.description]);
  }

  if (data.webUrls && data.webUrls.length > 0) {
    tags.push(['web', ...data.webUrls]);
  }

  if (data.cloneUrls.length > 0) {
    tags.push(['clone', ...data.cloneUrls]);
  }

  if (data.relays.length > 0) {
    tags.push(['relays', ...data.relays]);
  }

  tags.push(['t', 'shakespeare']);
  tags.push(['alt', `git repository: ${data.repoId}`]);

  return {
    kind: 30617,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a NIP-34 repository state event (kind 30618)
 */
function createRepoStateEvent(state: RepoState): { kind: number; content: string; tags: string[][]; created_at: number } {
  const tags: string[][] = [
    ['d', state.identifier],
    ['HEAD', state.head],
  ];

  for (const branch of state.branches) {
    tags.push([`refs/heads/${branch.name}`, branch.sha]);
  }

  for (const tag of state.tags) {
    tags.push([`refs/tags/${tag.name}`, tag.sha]);
  }

  return {
    kind: 30618,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}

export const ngit = tool({
  description: `Publish a git repository to Nostr Git (NIP-34). Creates repository announcement (kind 30617) and state (kind 30618) events. If the ngit CLI is installed, it will handle the full push including git objects. Requires an active Nostr connection.`,
  args: {
    projectPath: tool.schema
      .string()
      .optional()
      .describe('Path to the git repository. Defaults to current directory.'),
    name: tool.schema
      .string()
      .optional()
      .describe('Human-readable name for the repository. Defaults to the directory name.'),
    description: tool.schema
      .string()
      .optional()
      .describe('Description of the repository.'),
    identifier: tool.schema
      .string()
      .optional()
      .describe('Repository identifier (d-tag). Must be kebab-case. Defaults to directory name.'),
  },
  async execute(args) {
    const signer = getSigner();
    const projectPath = args.projectPath || process.cwd();

    // Check if it's a git repository
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return `Not a git repository. Please initialize git first:
  git init
  git add .
  git commit -m "Initial commit"

Then run shakespeare_ngit again.`;
    }

    // Check if ngit CLI is available
    const ngitAvailable = isNgitInstalled();

    // Check if connected (required for both flows)
    if (!signer.isConnected()) {
      if (ngitAvailable) {
        // ngit can use its own key, but we prefer our connected identity
        return `Not connected. Please run shakespeare_connect first to authenticate.

Alternatively, you can use ngit directly:
  ngit init --title "${args.name || path.basename(projectPath)}"`;
      }
      return `Not connected. Please run shakespeare_connect first to authenticate with your Nostr signer.

After connecting, run this command again to publish to Nostr Git.`;
    }

    try {
      // Get repository state
      const repoState = getRepoState(projectPath);

      if (repoState.branches.length === 0) {
        return `No commits found in repository. Please make at least one commit first:
  git add .
  git commit -m "Initial commit"

Then run shakespeare_ngit again.`;
      }

      // Override identifier if provided
      if (args.identifier) {
        repoState.identifier = args.identifier
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

      const userPubkey = signer.getUserPubkey();
      if (!userPubkey) {
        return 'Failed to get user public key. Please reconnect.';
      }

      const npub = nip19.npubEncode(userPubkey);
      const repoName = args.name || repoState.identifier;

      // If ngit is available, use it for the full flow
      if (ngitAvailable) {
        // Build ngit init command
        const ngitArgs = [
          'init',
          '--title', repoName,
          '--identifier', repoState.identifier,
        ];

        if (args.description) {
          ngitArgs.push('--description', args.description);
        }

        // Add relays
        for (const relay of DEFAULT_GRASP_SERVERS) {
          ngitArgs.push('--relays', relay);
        }

        // Run ngit init
        const result = spawnSync('ngit', ngitArgs, {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 120000, // 2 minute timeout
        });

        if (result.error) {
          throw new Error(`ngit failed: ${result.error.message}`);
        }

        const output = (result.stdout || '') + (result.stderr || '');
        
        if (result.status !== 0) {
          // Check if it's just an info message, not an error
          if (output.includes('already initialized') || output.includes('repository announcement')) {
            // Not an error, just informational
          } else {
            throw new Error(`ngit failed: ${output}`);
          }
        }

        // Generate nostr:// URI
        const nostrUri = `nostr://${npub}/${repoState.identifier}`;

        return `Published to Nostr Git via ngit!

Repository: ${repoName}
Identifier: ${repoState.identifier}

Nostr URI: ${nostrUri}

Branches: ${repoState.branches.map(b => b.name).join(', ')}
${repoState.tags.length > 0 ? `Tags: ${repoState.tags.map(t => t.name).join(', ')}\n` : ''}
ngit output:
${output.trim()}

To push changes:
  git push nostr

To clone this repository:
  ngit clone ${nostrUri}`;
      }

      // Fallback: publish Nostr events only (no git object push)
      const graspServers = DEFAULT_GRASP_SERVERS;
      const relays = signer.getRelays();

      // Build clone URLs
      const cloneUrls: string[] = [];
      for (const server of graspServers) {
        try {
          const serverUrl = new URL(server);
          const cloneUrl = `https://${serverUrl.host}/${npub}/${repoState.identifier}.git`;
          cloneUrls.push(cloneUrl);
        } catch {
          // Invalid URL, skip
        }
      }

      const allRelays = [...new Set([...graspServers, ...relays])];

      // Create and sign repository announcement
      const repoAnnouncement = createRepoAnnouncementEvent({
        repoId: repoState.identifier,
        name: repoName,
        description: args.description,
        cloneUrls,
        relays: allRelays,
      });
      const signedRepo = await signer.signEvent(repoAnnouncement);

      // Create and sign repository state
      const stateEvent = createRepoStateEvent(repoState);
      const signedState = await signer.signEvent(stateEvent);

      // Publish events
      const publishResults = await signer.publishEvents([signedRepo, signedState]);

      // Generate nostr:// URI
      const nostrUri = `nostr://${npub}/${repoState.identifier}`;

      return `Published Nostr events for repository!

Repository: ${repoName}
Identifier: ${repoState.identifier}

Nostr URI: ${nostrUri}

Clone URLs:
${cloneUrls.map(u => `  ${u}`).join('\n')}

Branches: ${repoState.branches.map(b => b.name).join(', ')}
${repoState.tags.length > 0 ? `Tags: ${repoState.tags.map(t => t.name).join(', ')}\n` : ''}
Events published to ${publishResults.success} relay(s):
  - Repository announcement (kind 30617): ${signedRepo.id.substring(0, 8)}...
  - Repository state (kind 30618): ${signedState.id.substring(0, 8)}...

Note: Git objects were not pushed. To push git objects, install ngit:
  cargo install ngit
  # or
  brew install ngit

Then run: ngit init`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `Failed to publish to Nostr Git: ${message}

Make sure:
1. You are connected (shakespeare_connect)
2. The directory is a git repository with commits
3. You have git installed`;
    }
  },
});
