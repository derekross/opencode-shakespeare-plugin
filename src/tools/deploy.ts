/**
 * shakespeare_deploy tool
 * Deploys a built project to Shakespeare Deploy using NIP-98 authentication
 * 
 * This matches the deployment method used by Shakespeare web app.
 */

import { tool } from '@opencode-ai/plugin';
import { getSigner } from '../signer.js';
import * as fs from 'fs';
import * as path from 'path';
import { NIP98 } from '@nostrify/nostrify';
import { N64 } from '@nostrify/nostrify/utils';

// Default deploy host
const DEFAULT_HOST = 'shakespeare.wtf';

/**
 * Recursively collect all files in a directory
 */
async function collectFiles(dir: string, baseDir: string = dir): Promise<{ path: string; content: Buffer }[]> {
  const files: { path: string; content: Buffer }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(fullPath);
      files.push({ path: relativePath, content });
    }
  }

  return files;
}

export const deploy = tool({
  description: `Deploy a built project to Shakespeare Deploy (shakespeare.wtf). This uploads the dist/ directory using NIP-98 authentication - the same method used by Shakespeare web app. Requires an active Nostr connection. Run 'npm run build' first to create the dist/ folder.`,
  args: {
    projectPath: tool.schema
      .string()
      .optional()
      .describe('Path to the project directory. Defaults to current directory.'),
    subdomain: tool.schema
      .string()
      .optional()
      .describe('Custom subdomain for deployment (e.g., "myapp" becomes myapp.shakespeare.wtf). Defaults to project name.'),
    host: tool.schema
      .string()
      .optional()
      .describe('Deploy host. Defaults to shakespeare.wtf'),
  },
  async execute(args) {
    const signer = getSigner();

    // Check if connected
    if (!signer.isConnected()) {
      return `Not connected to Nostr. Please authenticate first:

1. Run shakespeare_connect to display a QR code
2. Scan with Amber (Android) or Primal (Android/iOS)
3. Run shakespeare_deploy again`;
    }

    const projectPath = args.projectPath || process.cwd();
    const host = args.host || DEFAULT_HOST;
    const distPath = path.join(projectPath, 'dist');

    // Check if dist directory exists
    if (!fs.existsSync(distPath)) {
      return `No dist/ directory found at ${distPath}.

Build your project first:
  npm run build

Then run shakespeare_deploy again.`;
    }

    // Check if dist contains index.html
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return `No index.html found in dist/ directory.

Make sure your build output includes an index.html file.`;
    }

    // Determine subdomain - use directory name as default (that's what user named their project)
    let subdomain = args.subdomain;
    if (!subdomain) {
      subdomain = path.basename(projectPath).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    }

    const hostname = `${subdomain}.${host}`;
    const deployUrl = `https://${host}/deploy`;
    const siteUrl = `https://${hostname}`;

    try {
      // Dynamically import JSZip (ESM)
      const JSZip = (await import('jszip')).default;

      // Create ZIP of dist directory
      const zip = new JSZip();
      const files = await collectFiles(distPath);

      for (const file of files) {
        zip.file(file.path, file.content);
      }

      // Generate ZIP as ArrayBuffer for Blob compatibility
      const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
      const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

      // Create FormData
      const formData = new FormData();
      formData.append('hostname', hostname);
      formData.append('file', zipBlob, `${subdomain}.zip`);

      // Create the request (same as Shakespeare web app)
      let request = new Request(deployUrl, {
        method: 'POST',
        body: formData,
      });

      // Create NIP-98 auth token using the same method as Shakespeare web
      const template = await NIP98.template(request);
      const signedEvent = await signer.signEvent(template);
      const token = N64.encodeEvent(signedEvent);

      // Add Authorization header
      const headers = new Headers(request.headers);
      headers.set('Authorization', `Nostr ${token}`);
      request = new Request(request, { headers });

      // Deploy
      const response = await fetch(request);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return `Deployment failed: ${response.status} ${response.statusText}

${errorText}

Make sure you're authenticated with a valid Nostr identity.`;
      }

      return `Deployed to Shakespeare!

Live URL: ${siteUrl}

Files: ${files.length}
Host: ${host}
Subdomain: ${subdomain}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `Deployment failed: ${message}

Make sure:
1. You are connected (shakespeare_connect)
2. Your project is built (npm run build)
3. The dist/ directory contains your site files`;
    }
  },
});
