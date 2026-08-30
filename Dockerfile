FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM rust:1-slim AS server
WORKDIR /build
ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked && mkdir /build/data

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=server --chown=nonroot:nonroot /build/target/release/coop-boss-access /app/coop-boss-access
COPY --from=web --chown=nonroot:nonroot /build/dist /app/dist
COPY --from=server --chown=nonroot:nonroot /build/data /app/data
COPY --chown=nonroot:nonroot migrations /app/migrations
ENV PORT=8080
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/coop-boss-access"]
