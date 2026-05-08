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

const DEFAULT_CREATORS_THROTTLE_MS = 1100;

function creatorsThrottleMs() {
  const raw = process.env.AMAZON_CREATORS_THROTTLE_MS;
  if (raw === '' || raw === undefined) return DEFAULT_CREATORS_THROTTLE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CREATORS_THROTTLE_MS;
}

/** Serialize Creators API traffic + enforce minimum gap between calls (429 / TPS safety). */
let _creatorsGate = Promise.resolve();
let _lastCreatorsCallEnd = 0;

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function runCreatorsApi(fn) {
  const run = _creatorsGate.then(async () => {
    const gap = creatorsThrottleMs();
    if (gap > 0 && _lastCreatorsCallEnd > 0) {
      const elapsed = Date.now() - _lastCreatorsCallEnd;
      if (elapsed < gap) {
        await new Promise((r) => setTimeout(r, gap - elapsed));
      }
    }
    try {
      return await fn();
    } finally {
      _lastCreatorsCallEnd = Date.now();
    }
  });
  _creatorsGate = run.catch(() => {});
  return run;
}

function withPartnerTag(body) {
  const cfg = getConfig();
  return { partnerTag: cfg.associateTag, ...body };
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const URL_FETCH_TIMEOUT_MS = 15000;

function normalizeHttpUrl(input) {
  const s = String(input).trim();
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  const u = new URL(withProto);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported');
  }
  return u.href;
}

/**
 * Extract Amazon ASIN from a fully resolved product URL.
 * @param {string} urlString
 * @returns {string | null}
 */
function extractAsinFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const q = u.searchParams.get('asin');
    if (q && /^[A-Z0-9]{10}$/i.test(q)) {
      return q.toUpperCase();
    }
    const path = u.pathname;
    const patterns = [
      /\/dp\/([A-Z0-9]{10})(?:\/|$|[?#])/i,
      /\/gp\/product\/([A-Z0-9]{10})(?:\/|$|[?#])/i,
      /\/gp\/aw\/d\/([A-Z0-9]{10})(?:\/|$|[?#])/i,
      /\/exec\/obidos\/asin\/([A-Z0-9]{10})(?:\/|$|[?#])/i,
      /\/o\/asin\/([A-Z0-9]{10})(?:\/|$|[?#])/i,
      /\/(?:[a-z-]+)\/dp\/([A-Z0-9]{10})(?:\/|$|[?#])/i,
    ];
    for (const re of patterns) {
      const m = path.match(re);
      if (m) return m[1].toUpperCase();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Follow redirects to the final landing URL (amzn.to, a.co, /dp/, etc.).
 * @param {string} startUrl
 * @returns {Promise<string>}
 */
async function resolveToFinalUrl(startUrl) {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), URL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(startUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': DEFAULT_UA, Accept: 'text/html,*/*' },
    });
    const finalUrl = res.url;
    try {
      await res.body?.cancel?.();
    } catch (_) {
      /* ignore */
    }
    return finalUrl;
  } finally {
    clearTimeout(tid);
  }
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
        const data = await runCreatorsApi(() =>
          api.getItems(cfg.marketplace, req),
        );
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
        const data = await runCreatorsApi(() =>
          api.searchItems(cfg.marketplace, {
            searchItemsRequestContent: req,
          }),
        );
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
        const data = await runCreatorsApi(() =>
          api.getBrowseNodes(cfg.marketplace, req),
        );
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
        const data = await runCreatorsApi(() =>
          api.getVariations(cfg.marketplace, req),
        );
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
        const data = await runCreatorsApi(() => api.listFeeds(cfg.marketplace));
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
        const data = await runCreatorsApi(() =>
          api.getFeed(cfg.marketplace, req),
        );
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
        const data = await runCreatorsApi(() =>
          api.listReports(cfg.marketplace),
        );
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
        const data = await runCreatorsApi(() =>
          api.getReport(cfg.marketplace, req),
        );
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.registerTool(
    'amazon_creators_short_url_to_id',
    {
      description:
        'Resolve an Amazon short link (amzn.to, a.co) or product URL: follow redirects, then return the ASIN. Skips network if the URL already contains an ASIN. Does not use Creators API credentials.',
      inputSchema: {
        url: z
          .string()
          .min(1)
          .describe(
            'Short URL or Amazon product link; https:// optional.',
          ),
      },
    },
    async ({ url: urlInput }) => {
      try {
        const normalized = normalizeHttpUrl(urlInput);
        let directAsin = extractAsinFromUrl(normalized);
        let finalUrl = normalized;
        if (!directAsin) {
          finalUrl = await resolveToFinalUrl(normalized);
          directAsin = extractAsinFromUrl(finalUrl);
        }
        const out = {
          asin: directAsin,
          finalUrl,
          inputNormalized: normalized,
        };
        if (directAsin == null) {
          out.note =
            'No ASIN in final URL path or ?asin=. The page may need a browser, block bots, or use an unsupported format.';
        }
        return jsonResult(out);
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
        const data = await runCreatorsApi(() =>
          api.getItems(cfg.marketplace, req),
        );
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
        const data = await runCreatorsApi(() =>
          api.getItems(cfg.marketplace, req),
        );
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
