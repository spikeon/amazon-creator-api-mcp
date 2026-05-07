FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/server.mjs ./src/server.mjs

ENV NODE_ENV=production
# Credentials and marketplace are supplied by MCP / docker run (see mcp.paste.json).

CMD ["node", "src/server.mjs"]
