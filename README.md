# Amazon Creators API MCP

A [Model Context Protocol](https://modelcontextprotocol.io) (stdio) server that exposes the [Amazon Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) to compatible clients (e.g. Cursor). Product calls use the official HTTP API via [`amazon-creator-api-sdk`](https://www.npmjs.com/package/amazon-creator-api-sdk) (OAuth2 as implemented by the SDK).

## Requirements

- Node.js **18+** (for local runs; Docker image uses Node 22)
- Docker Desktop (or compatible engine) if you run the MCP through the provided image
- Valid Creators API credentials from Associates Central

## Quick start (Docker)

1. Clone or copy this repository and open a shell at the repo root.

2. Build the image:

   ```bash
   npm run docker:build
   ```

3. Add the server to your MCP config. You can start from `mcp.paste.json` and merge `mcpServers` into your existing `mcp.json`.

4. Replace the placeholder `env` values in `mcp.json` with your real secrets and marketplace host.

5. Restart the MCP host / Cursor so it picks up the new server.

## Quick start (local Node)

Set the environment variables below, then:

```bash
npm install
npm start
```

Point your MCP client at `node` with argument `src/server.mjs` (absolute path recommended) and the same `env` keys as in `mcp.paste.json`.

## Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `AMAZON_ASSOCIATE_TAG` | Yes | Partner / associate tag used as `partnerTag` on catalog requests (injected if omitted from tool `payload`). |
| `AMAZON_CREATORS_CLIENT_ID` | Yes | Creators API credential id (SDK `credentialId`). |
| `AMAZON_CREATORS_CLIENT_SECRET` | Yes | Creators API credential secret (SDK `credentialSecret`). |
| `AMAZON_MARKETPLACE` | Yes | Marketplace host for `x-marketplace`, e.g. `www.amazon.com`. |
| `AMAZON_CREATORS_CREDENTIAL_VERSION` | No | Credential API version from Associates Central. Default: `3.1`. |

Never commit real credentials; use your client’s MCP `env` block or a secret manager.

## Tools

Catalog operations accept a **`payload`** object: JSON fields match the Creators API request bodies (lowerCamelCase), as in the [official docs](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction).

| Tool | Description |
|------|-------------|
| `amazon_creators_get_items` | Get items by ASIN(s) and requested `resources`. |
| `amazon_creators_search_items` | Keyword (and optional index, filters, pagination) search. |
| `amazon_creators_get_browse_nodes` | Browse node metadata, ancestors, children. |
| `amazon_creators_get_variations` | Variations for a parent or child ASIN. |
| `amazon_creators_list_feeds` | List feed names. |
| `amazon_creators_get_feed` | Pre-signed URL / metadata for a named feed (`feedName`). |
| `amazon_creators_list_reports` | List report files. |
| `amazon_creators_get_report` | Fetch a report by `filename` from the list. |
| `getPriceById` | Shortcut: one ASIN, `offersV2.listings.price` + title; returns a small summary and full response. |
| `getQtyById` | Shortcut: one ASIN, availability fields; summarizes **max/min order quantity** and availability type. The API does **not** return a true on-hand stock count. |

## Cursor `mcp.json` example

See **`mcp.paste.json`** for a full Docker-based `amazon-creator-api` entry. Merge it under your top-level `"mcpServers"` object alongside any other servers you already use.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Run the MCP server on stdio (requires env vars). |
| `npm run docker:build` | Build `amazon-creator-api-mcp:latest`. |

## API coverage note

This project exposes every operation present on the npm SDK’s `DefaultApi` for the version pinned in `package.json`. If Amazon publishes new endpoints in the docs before the SDK is updated, upgrade `amazon-creator-api-sdk` and extend `src/server.mjs` if new methods appear.

## License

ISC (see `package.json`). The `amazon-creator-api-sdk` package carries its own license (Apache-2.0).
