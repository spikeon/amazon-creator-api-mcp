/**
 * Amazon Creators API MCP — stdio server for Cursor and other MCP clients.
 * @see https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
 */

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

const require = createRequire(import.meta.url);
const sdk = require('amazon-creator-api-sdk');

const {
  ApiClient,
  DefaultApi,
  GetItemsRequestContent,
  SearchItemsRequestContent,
  GetBrowseNodesRequestContent,
  GetVariationsRequestContent,
  GetFeedRequestContent,
  GetReportRequestContent,
} = sdk;

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(v).trim();
}

function getConfig() {
  return {
    associateTag: requireEnv('AMAZON_ASSOCIATE_TAG'),
    clientId: requireEnv('AMAZON_CREATORS_CLIENT_ID'),
    clientSecret: requireEnv('AMAZON_CREATORS_CLIENT_SECRET'),
    marketplace: requireEnv('AMAZON_MARKETPLACE'),
    credentialVersion: (
      process.env.AMAZON_CREATORS_CREDENTIAL_VERSION || '3.1'
    ).trim(),
  };
}

let _api;
function getApi() {
  if (_api) return _api;
  const cfg = getConfig();
  const client = new ApiClient();
  client.credentialId = cfg.clientId;
  client.credentialSecret = cfg.clientSecret;
  client.version = cfg.credentialVersion;
  _api = { api: new DefaultApi(client), cfg };
  return _api;
}

function withPartnerTag(body) {
  const cfg = getConfig();
  return { partnerTag: cfg.associateTag, ...body };
}

function jsonResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function errResult(e) {
  const status = e?.status ?? e?.response?.status ?? null;
  const body = e?.body ?? e?.response?.body;
  const text =
    typeof e?.response?.text === 'string' ? e.response.text : undefined;
  const msg =
    (body !== undefined && body !== null
      ? typeof body === 'object'
        ? JSON.stringify(body)
        : String(body)
      : null) ||
    text ||
    e?.error?.message ||
    e?.message ||
    String(e);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: msg, httpStatus: status }, null, 2),
      },
    ],
    isError: true,
  };
}

function itemTitle(item) {
  return (
    item?.itemInfo?.title?.displayValue ||
    item?.itemInfo?.title?.label ||
    null
  );
}

/** Prefer Buy Box winner, else first listing with data, else first. */
function pickListing(item) {
  const listings = item?.offersV2?.listings;
  if (!Array.isArray(listings) || !listings.length) return null;
  const buyBox = listings.find((l) => l?.isBuyBoxWinner === true);
  if (buyBox) return buyBox;
  return listings[0];
}

function summarizePriceFromItem(item) {
  const listing = pickListing(item);
  const money = listing?.price?.money;
  return {
    displayAmount: money?.displayAmount ?? null,
    priceAmount: money?.amount ?? null,
    currency: money?.currency ?? null,
    isBuyBoxWinner: listing?.isBuyBoxWinner ?? null,
    listingType: listing?.type?.displayString ?? listing?.type?.value ?? null,
  };
}

function summarizeQtyFromItem(item) {
  const listing = pickListing(item);
  const a = listing?.availability;
  return {
    availabilityType: a?.type ?? null,
    message: a?.message ?? null,
    maxOrderQuantity: a?.maxOrderQuantity ?? null,
    minOrderQuantity: a?.minOrderQuantity ?? null,
    isBuyBoxWinner: listing?.isBuyBoxWinner ?? null,
  };
}

const payloadSchema = z
  .record(z.string(), z.unknown())
  .describe('Request body fields for this Creators API operation (lowerCamelCase JSON per Amazon docs). partnerTag is injected from AMAZON_ASSOCIATE_TAG when omitted.');

async function main() {
  const server = new McpServer({
    name: 'amazon-creator-api',
    version: '1.0.0',
  });

  server.registerTool(
    'amazon_creators_get_items',
    {
      description:
        'Creators API GetItems — catalog/v1/getItems. Retrieve item details by ASINs. Pass GetItemsRequestContent fields in `payload` (itemIds, resources, etc.). Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction',
      inputSchema: { payload: payloadSchema },
    },
    async ({ payload }) => {
      try {
        const { api, cfg } = getApi();
        const body = withPartnerTag(payload);
        const req = GetItemsRequestContent.constructFromObject(body);
        const data = await api.getItems(cfg.marketplace, req);
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_search_items',
    {
      description:
        'Creators API SearchItems — catalog/v1/searchItems. Pass SearchItemsRequestContent in `payload` (keywords, searchIndex, itemCount, resources, etc.).',
      inputSchema: { payload: payloadSchema },
    },
    async ({ payload }) => {
      try {
        const { api, cfg } = getApi();
        const body = withPartnerTag(payload);
        const req = SearchItemsRequestContent.constructFromObject(body);
        const data = await api.searchItems(cfg.marketplace, {
          searchItemsRequestContent: req,
        });
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_get_browse_nodes',
    {
      description:
        'Creators API GetBrowseNodes — catalog/v1/getBrowseNodes. Pass GetBrowseNodesRequestContent in `payload` (browseNodeIds, resources).',
      inputSchema: { payload: payloadSchema },
    },
    async ({ payload }) => {
      try {
        const { api, cfg } = getApi();
        const body = withPartnerTag(payload);
        const req = GetBrowseNodesRequestContent.constructFromObject(body);
        const data = await api.getBrowseNodes(cfg.marketplace, req);
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_get_variations',
    {
      description:
        'Creators API GetVariations — catalog/v1/getVariations. Pass GetVariationsRequestContent in `payload` (asin, resources, variationPage, variationCount).',
      inputSchema: { payload: payloadSchema },
    },
    async ({ payload }) => {
      try {
        const { api, cfg } = getApi();
        const body = withPartnerTag(payload);
        const req = GetVariationsRequestContent.constructFromObject(body);
        const data = await api.getVariations(cfg.marketplace, req);
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_list_feeds',
    {
      description:
        'Creators API ListFeeds — catalog/v1/listFeeds. Lists feed names available for GetFeed.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const { api, cfg } = getApi();
        const data = await api.listFeeds(cfg.marketplace);
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_get_feed',
    {
      description:
        'Creators API GetFeed — catalog/v1/getFeed. `feedName` from ListFeeds.',
      inputSchema: {
        feedName: z.string().min(1).describe('Feed name from list_feeds'),
      },
    },
    async ({ feedName }) => {
      try {
        const { api, cfg } = getApi();
        const req = GetFeedRequestContent.constructFromObject({ feedName });
        const data = await api.getFeed(cfg.marketplace, req);
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_list_reports',
    {
      description:
        'Creators API ListReports — reports/v1/listReports. Lists report filenames for GetReport.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const { api, cfg } = getApi();
        const data = await api.listReports(cfg.marketplace);
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_get_report',
    {
      description:
        'Creators API GetReport — reports/v1/getReport. `filename` from ListReports.',
      inputSchema: {
        filename: z
          .string()
          .min(1)
          .describe('Report filename from list_reports'),
      },
    },
    async ({ filename }) => {
      try {
        const { api, cfg } = getApi();
        const req = GetReportRequestContent.constructFromObject({ filename });
        const data = await api.getReport(cfg.marketplace, req);
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_get_price_by_id',
    {
      description:
        'Shortcut: GetItems for one ASIN with offersV2.listings.price (+ title). Returns a small summary plus raw item.',
      inputSchema: {
        asin: z.string().min(1),
      },
    },
    async ({ asin }) => {
      try {
        const { api, cfg } = getApi();
        const body = withPartnerTag({
          itemIds: [asin],
          resources: [
            'itemInfo.title',
            'offersV2.listings.price',
            'offersV2.listings.isBuyBoxWinner',
            'offersV2.listings.type',
          ],
        });
        const req = GetItemsRequestContent.constructFromObject(body);
        const data = await api.getItems(cfg.marketplace, req);
        const item = data?.itemsResult?.items?.[0];
        const summary = item
          ? {
              asin: item.asin,
              title: itemTitle(item),
              price: summarizePriceFromItem(item),
            }
          : { asin, title: null, price: null, note: 'No item in response' };
        return jsonResult({ summary, raw: data });
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_get_qty_by_id',
    {
      description:
        'Shortcut: GetItems for one ASIN with offersV2.listings.availability (+ title). Summarizes max/min order quantity and availability type (Amazon does not expose stock counts).',
      inputSchema: {
        asin: z.string().min(1),
      },
    },
    async ({ asin }) => {
      try {
        const { api, cfg } = getApi();
        const body = withPartnerTag({
          itemIds: [asin],
          resources: [
            'itemInfo.title',
            'offersV2.listings.availability',
            'offersV2.listings.isBuyBoxWinner',
          ],
        });
        const req = GetItemsRequestContent.constructFromObject(body);
        const data = await api.getItems(cfg.marketplace, req);
        const item = data?.itemsResult?.items?.[0];
        const summary = item
          ? {
              asin: item.asin,
              title: itemTitle(item),
              quantity: summarizeQtyFromItem(item),
            }
          : { asin, title: null, quantity: null, note: 'No item in response' };
        return jsonResult({ summary, raw: data });
      } catch (e) {
        return errResult(e);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
