# opencode-shakespeare-plugin

OpenCode plugin for building Nostr applications with mkstack and NIP-46 remote signing.

## Features

- **NIP-46 Remote Signing**: Authenticate via QR code scan - your private key never leaves your signer app
- **Shakespeare Deploy**: Deploy static sites to shakespeare.wtf with NIP-98 authentication
- **Nostr Git (ngit)**: Publish repositories to decentralized git hosting using NIP-34
- **mkstack Integration**: Initialize new Nostr projects using the mkstack framework
- **Shakespeare Agent**: Specialized AI agent for building Nostr applications

## Installation

1. Install the plugin in your project:

```bash
npm install opencode-shakespeare-plugin
```

2. Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-shakespeare-plugin"],
  "mcp": {
    "nostr": {
      "type": "local",
      "command": ["npx", "-y", "@nostrbook/mcp@latest"]
    }
  }
}
```

3. **Temporary workaround**: There's an ESM bug in `@opencode-ai/plugin` that requires a patch. Run this after installing:

```bash
echo 'export * from "./tool.js";' > node_modules/@opencode-ai/plugin/dist/index.js
```

> **Note**: You'll need to run this patch again after running `npm install`. This will be fixed once the opencode team patches the ESM issue.

## Usage

### Quick Start

1. Start OpenCode in your project directory
2. Invoke the Shakespeare agent: `@shakespeare`
3. Tell Shakespeare what you want to do - it will handle authentication automatically

### Natural Language Commands

The Shakespeare agent understands natural language. Just say:

**Deployment:**
- "deploy to shakespeare"
- "ship it"
- "put my site live"

**Nostr Git:**
- "publish to ngit"
- "push to nostr git"
- "commit to ngit"

**Building:**
- "build me a Twitter clone"
- "create a nostr app"

### Available Tools

| Tool | Description |
|------|-------------|
| `shakespeare_connect` | Display QR code and initiate NIP-46 connection |
| `shakespeare_status` | Check authentication status |
| `shakespeare_disconnect` | Disconnect and clear credentials |
| `shakespeare_sign_event` | Sign a Nostr event using remote signer |
| `shakespeare_get_pubkey` | Get connected user's public key |
| `shakespeare_init` | Initialize a new mkstack project |
| `shakespeare_deploy` | Deploy dist/ to shakespeare.wtf |
| `shakespeare_ngit` | Publish repository to Nostr Git (NIP-34) |

### Example: Deploy a Site

```
> @shakespeare deploy to shakespeare

Shakespeare: Let me build and deploy your project...

Building project...
$ npm run build

Checking authentication...
[QR code displayed if not connected]

Deploying to shakespeare.wtf...

Your site is live at: https://myapp.shakespeare.wtf
```

### Example: Publish to Nostr Git

```
> @shakespeare publish to ngit

Shakespeare: Publishing your repository to Nostr Git...

[QR code displayed if not connected]

Published!
Repository: my-project
Nostr URI: nostr://npub1.../my-project

Clone with:
  git clone nostr://npub1.../my-project
```

### Example: Build an App

```
> @shakespeare build me a decentralized Twitter clone

Shakespeare: Creating your project...

[Initializes mkstack, reads AGENTS.md, builds features]

Your app is ready! Run `npm run dev` to test it.
Want me to deploy it to shakespeare.wtf?
```

## Configuration

### Default Relays

The plugin uses these relays for NIP-46 communication by default:
- `wss://relay.ditto.pub`
- `wss://relay.primal.net`

You can specify custom relays when connecting:

```
> Use shakespeare_connect with relays "wss://my-relay.com,wss://other-relay.com"
```

### Authentication Storage

Credentials are stored in `~/.config/shakespeare/auth.json`. This includes:
- Client keypair (for relay communication only)
- Bunker public key
- User public key
- Connected relays

Your **private key is never stored** - it remains in your signer app.

## Supported Signer Apps

- [Amber](https://github.com/greenart7c3/Amber) (Android)
- [Primal](https://primal.net/) (Android/iOS)

## Shakespeare Deploy

Deploy your built static site to shakespeare.wtf:

1. Build your project: `npm run build`
2. Tell Shakespeare to deploy: `@shakespeare deploy`
3. Your site will be live at `https://yourapp.shakespeare.wtf`

The deployment uses NIP-98 HTTP authentication - your Nostr identity proves ownership.

## Nostr Git (NIP-34)

Publish your repository to decentralized git hosting:

1. Make sure you have commits in your repo
2. Tell Shakespeare to publish: `@shakespeare publish to ngit`
3. Your repo will be available at `nostr://npub1.../your-repo`

This creates:
- **Kind 30617**: Repository announcement (clone URLs, relays)
- **Kind 30618**: Repository state (branches, tags, HEAD)

## Agent Definition

The plugin includes a specialized agent definition at `agent/shakespeare.md`. The agent:

- Handles authentication automatically
- Understands natural language commands
- Guides you through Nostr app development
- Manages deployments and git publishing

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
