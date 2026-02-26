FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install sharp dependencies
RUN apk add --no-cache vips-dev

FROM base AS install
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base AS release
COPY --from=install /app/node_modules node_modules
COPY . .

RUN mkdir -p /app/data

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
