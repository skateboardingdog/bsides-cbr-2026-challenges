FROM node:22-bookworm-slim AS build

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY mylevels/ ./mylevels/
COPY public/ ./public/
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=1337

COPY --chown=node:node package.json .env.production ./
COPY --from=build --chown=node:node /build/dist/ ./dist/
COPY --chown=node:node server/ ./server/
COPY --chown=node:node src/engine.js src/expression.js src/flag.js src/flag-transport.js src/levels.js ./src/
COPY --chown=node:node mylevels/ ./mylevels/

USER node
EXPOSE 1337
CMD ["node", "--env-file=.env.production", "server/production.js"]
