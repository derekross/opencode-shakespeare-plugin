/**
 * shakespeare_init tool
 * Clone mkstack and set up a new Nostr application project
 */

import { tool } from '@opencode-ai/plugin';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MKSTACK_REPO = 'https://gitlab.com/soapbox-pub/mkstack.git';

/**
 * OpenCode configuration for Shakespeare projects
 */
const OPENCODE_CONFIG = {
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@shakespeare.diy/opencode-plugin"],
  "mcp": {
    "nostr": {
      "type": "local",
      "command": ["npx", "-y", "@nostrbook/mcp@latest"]
    }
  }
};

export const init = tool({
  description: `Initialize a new Nostr application project using the mkstack framework. This clones the mkstack template, configures the Shakespeare plugin, and sets up all dependencies. After initialization, read the AGENTS.md file to understand the project structure.`,
  args: {
    name: tool.schema.string().describe('The name for your new project (will be used as directory name)'),
    directory: tool.schema.string().optional().describe('Parent directory to create the project in. Defaults to current directory.'),
  },
  async execute(args) {
    const projectName = args.name.trim().replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    
    if (!projectName) {
      return JSON.stringify({
        success: false,
        error: 'Project name is required',
      });
    }

    const parentDir = args.directory || process.cwd();
    const projectPath = join(parentDir, projectName);

    // Check if directory already exists
    if (existsSync(projectPath)) {
      return JSON.stringify({
        success: false,
        error: `Directory "${projectPath}" already exists. Choose a different name or delete the existing directory.`,
      });
    }

    return JSON.stringify({
      success: true,
      action: 'clone_and_setup',
      projectName,
      projectPath,
      repo: MKSTACK_REPO,
      opencodeConfig: OPENCODE_CONFIG,
      instructions: [
        `Clone the mkstack repository: git clone ${MKSTACK_REPO} ${projectName}`,
        `Change to project directory: cd ${projectName}`,
        `Remove the .git directory: rm -rf .git`,
        `Initialize new git repo: git init`,
        `Create opencode.json with Shakespeare plugin configured`,
        `Install dependencies: npm install`,
        `Read the AGENTS.md file to understand the project structure`,
        `The project is now ready for development!`,
      ],
      commands: [
        `git clone ${MKSTACK_REPO} "${projectPath}"`,
        `rm -rf "${projectPath}/.git"`,
        `git init "${projectPath}"`,
      ],
      postCloneSetup: {
        description: 'After cloning, create opencode.json in the project directory',
        file: 'opencode.json',
        content: JSON.stringify(OPENCODE_CONFIG, null, 2),
      },
      finalCommands: [
        `cd "${projectPath}" && npm install`,
      ],
      nextSteps: [
        'Read AGENTS.md to understand the mkstack framework',
        'Use shakespeare_deploy to deploy to shakespeare.wtf',
        'Use shakespeare_ngit to publish to Nostr Git',
        'Use shakespeare_sign_event for signing Nostr events',
      ],
    }, null, 2);
  },
});
