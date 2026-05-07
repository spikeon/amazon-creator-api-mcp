# Amazon Creators API MCP

A [Model Context Protocol](https://modelcontextprotocol.io) (stdio) server that exposes the [Amazon Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) to compatible clients (e.g. Cursor). HTTP calls use the official API via [`amazon-creator-api-sdk`](https://www.npmjs.com/package/amazon-creator-api-sdk) (OAuth2 as implemented by the SDK).

## Install (GHCR + Docker)

**Image:** `ghcr.io/spikeon/amazon-creator-api-mcp:mcp` (same as `:latest`)

**You need:** Docker Desktop or another engine that can `docker run`, plus Creators API credentials from Associates Central.

### 1. Cursor `mcp.json`

Copy the server block from **`mcp.paste.json`** into your MCP config (merge under `"mcpServers"`). It runs Docker with `-i --rm`, passes your secrets through `-e`, and uses the GHCR image—no clone and no local image build.

Equivalent shape:

```json
{
  "mcpServers": {
    "amazon-creator-api": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "AMAZON_ASSOCIATE_TAG",
        "-e",
        "AMAZON_CREATORS_CLIENT_ID",
        "-e",
        "AMAZON_CREATORS_CLIENT_SECRET",
        "-e",
        "AMAZON_MARKETPLACE",
        "-e",
        "AMAZON_CREATORS_CREDENTIAL_VERSION",
        "ghcr.io/spikeon/amazon-creator-api-mcp:mcp"
      ],
      "env": {
        "AMAZON_ASSOCIATE_TAG": "your-partner-tag-20",
        "AMAZON_CREATORS_CLIENT_ID": "your-client-id",
        "AMAZON_CREATORS_CLIENT_SECRET": "your-client-secret",
        "AMAZON_MARKETPLACE": "www.amazon.com",
        "AMAZON_CREATORS_CREDENTIAL_VERSION": "3.1"
      }
    }
  }
}
```

Replace the `env` values with your real data. Restart Cursor (or your MCP host) after saving.

### 2. Optional: verify the image

```bash
docker pull ghcr.io/spikeon/amazon-creator-api-mcp:mcp
```

If pull fails with “unauthorized”, the package may still be private. Open **[your package on GitHub](https://github.com/users/spikeon/packages/container/amazon-creator-api-mcp)** → **Package settings** → set visibility to **Public**, or `docker login ghcr.io` with a token that has `read:packages`.

### Image updates

Pushes to `main` build and publish via [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml). Run `docker pull ghcr.io/spikeon/amazon-creator-api-mcp:mcp` to refresh.

## Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `AMAZON_ASSOCIATE_TAG` | Yes | Partner tag used as `partnerTag` (injected if omitted from tool `payload`). |
| `AMAZON_CREATORS_CLIENT_ID` | Yes | SDK `credentialId`. |
| `AMAZON_CREATORS_CLIENT_SECRET` | Yes | SDK `credentialSecret`. |
| `AMAZON_MARKETPLACE` | Yes | `x-marketplace` host, e.g. `www.amazon.com`. |
| `AMAZON_CREATORS_CREDENTIAL_VERSION` | No | Version from Associates Central. Default: `3.1`. |

Do not commit real credentials.

## Tools

Catalog tools take a **`payload`** object: fields match Creators API request bodies (lowerCamelCase), per the [official docs](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction).

| Tool | Description |
|------|-------------|
| `amazon_creators_get_items` | Get items by ASIN(s) and `resources`. |
| `amazon_creators_search_items` | Keyword search and related parameters. |
| `amazon_creators_get_browse_nodes` | Browse nodes, ancestors, children. |
| `amazon_creators_get_variations` | Variations for a parent or child ASIN. |
| `amazon_creators_list_feeds` | List feed names. |
| `amazon_creators_get_feed` | Feed by `feedName`. |
| `amazon_creators_list_reports` | List report files. |
| `amazon_creators_get_report` | Report by `filename`. |
| `amazon_creators_short_url_to_id` | Turn `amzn.to` / `a.co` / `/dp/…` links into an **ASIN** (HTTP redirect resolve; no Creators API call). |
| `amazon_creators_get_price_by_id` | One ASIN: price + title summary and full response. |
| `amazon_creators_get_qty_by_id` | One ASIN: availability summary (max/min order quantity, type)—not true stock on hand. |

## API coverage

This repo mirrors the npm SDK’s `DefaultApi` for the version in `package.json`. If the docs add operations before the SDK does, upgrade `amazon-creator-api-sdk` and extend `src/server.mjs`.

## Development

To run or build from source (not required for the GHCR install):

- Clone the repo, `npm install`, `npm start` (stdio; set the same env vars; MCP client should invoke `node` with `src/server.mjs`).
- `npm run docker:build` builds a local `amazon-creator-api-mcp:latest` if you want to test image changes before pushing to `main`.

## License

ISC (see `package.json`). The `amazon-creator-api-sdk` package uses Apache-2.0.
