# opencode-shakespeare-plugin

OpenCode plugin for Shakespeare AI provider with NIP-46 remote signing and Nostr development tools.

## Features

- **Shakespeare AI Provider**: Use Claude and other models via Shakespeare AI with NIP-98 authentication
- **NIP-46 Remote Signing**: Authenticate via QR code scan - your private key never leaves your signer app
- **Shakespeare Deploy**: Deploy static sites to shakespeare.wtf
- **Nostr Git (ngit)**: Publish repositories to decentralized git hosting using NIP-34
- **mkstack Integration**: Initialize new Nostr projects using the mkstack framework
- **Shakespeare Agent**: Specialized AI agent for building Nostr applications

## Installation

### 1. Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-shakespeare-plugin"]
}
```

The plugin will automatically configure the Shakespeare AI provider and models on first run.

### 2. (Optional) Install the Shakespeare agent

The Shakespeare agent provides natural language commands for Nostr development:

```bash
mkdir -p ~/.config/opencode/agent
cp node_modules/opencode-shakespeare-plugin/agent/shakespeare.md ~/.config/opencode/agent/
```

### 3. (Optional) Add the Nostr MCP server

For enhanced Nostr functionality:

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

## Authentication

Shakespeare AI uses NIP-46 remote signing for authentication. This means:
- Your private key (nsec) never leaves your signer app
- You authenticate by scanning a QR code
- Authentication persists across sessions

### Connect to Shakespeare AI

1. Start OpenCode in your project
2. Run `shakespeare_connect` - a QR code will be displayed
3. Scan the QR code with your signer app (Amber or Primal)
4. Approve the connection in your signer app
5. Run `shakespeare_complete` to finish the connection

```
> shakespeare_connect

[QR Code displayed]

Scan with Amber (Android) or Primal (iOS/Android)

> shakespeare_complete

Connected successfully!
User pubkey: npub1...
```

### Check connection status

```
> shakespeare_status

Connected: Yes
Public Key: npub1...
Relays: wss://relay.ditto.pub, wss://relay.primal.net
```

### Select Shakespeare AI model

After connecting, select a Shakespeare model via `/models` or `/connect`:

1. Press `/connect` and search for "Shakespeare"
2. Select "Nostr (NIP-46)" authentication
3. Choose a model (e.g., `claude-sonnet-4.5`)

Or set it in your `opencode.json`:

```json
{
  "plugin": ["opencode-shakespeare-plugin"],
  "model": "shakespeare/claude-sonnet-4.5"
}
```

## Available Models

The plugin automatically fetches available models from Shakespeare AI. Current models include:

- `claude-sonnet-4.5` - Fast, capable model for most tasks
- `claude-opus-4.5` - Most capable model for complex tasks

## Available Tools

| Tool | Description |
|------|-------------|
| `shakespeare_connect` | Display QR code to initiate NIP-46 connection |
| `shakespeare_complete` | Complete the connection after scanning QR code |
| `shakespeare_status` | Check authentication status |
| `shakespeare_disconnect` | Disconnect and clear credentials |
| `shakespeare_sign_event` | Sign a Nostr event using remote signer |
| `shakespeare_get_pubkey` | Get connected user's public key |
| `shakespeare_init` | Initialize a new mkstack project |
| `shakespeare_deploy` | Deploy dist/ to shakespeare.wtf |
| `shakespeare_ngit` | Publish repository to Nostr Git (NIP-34) |

## Usage Examples

### Using Shakespeare AI for coding

Once connected, Shakespeare AI works like any other provider:

```
> Help me build a REST API endpoint

[Claude responds via Shakespeare AI with NIP-98 authentication]
```

### Deploy a site

```
> shakespeare_deploy

Building site from dist/...
Deploying to shakespeare.wtf...

Your site is live at: https://yourapp.shakespeare.wtf
```

### Publish to Nostr Git

```
> shakespeare_ngit

Publishing repository to Nostr Git...

Published!
Repository: my-project
Clone with: git clone nostr://npub1.../my-project
```

### Initialize a new project

```
> shakespeare_init my-nostr-app

Cloning mkstack template...
Installing dependencies...

Project created at ./my-nostr-app
```

## Configuration

### Default Relays

The plugin uses these relays for NIP-46 communication:
- `wss://relay.ditto.pub`
- `wss://relay.primal.net`

Specify custom relays when connecting:

```
> shakespeare_connect with relays wss://my-relay.com,wss://other-relay.com
```

### Authentication Storage

Credentials are stored in `~/.config/shakespeare/auth.json`:
- Client keypair (for relay communication only)
- Bunker public key
- User public key
- Connected relays

**Your private key is never stored** - it remains in your signer app.

## Supported Signer Apps

- [Amber](https://github.com/greenart7c3/Amber) (Android)
- [Primal](https://primal.net/) (Android/iOS)

## Troubleshooting

### "Not connected to Nostr" error

Run `shakespeare_connect` followed by `shakespeare_complete` to establish a connection.

### Models not appearing

The plugin auto-configures on first run. If models don't appear:
1. Restart OpenCode
2. Check that `opencode.json` has the `provider.shakespeare` section
3. Run `/connect` and select Shakespeare AI

### Connection not persisting

Check that `~/.config/shakespeare/auth.json` exists after connecting. If it's being deleted, there may be a permission issue with the config directory.

### QR code not scanning

- Ensure your signer app supports NIP-46 (nostrconnect://)
- Try different relays if the default ones are unreachable
- Check that your phone and computer are on the same network (not required, but helps)

## Development

```bash
# Clone the repo
git clone https://github.com/derekross/opencode-shakespeare-plugin
cd opencode-shakespeare-plugin

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
