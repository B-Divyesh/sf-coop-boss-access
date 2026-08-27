FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM rust:1.89-bookworm AS server
WORKDIR /build
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
ENV DATABASE_URL="sqlite://data/coop.db?mode=rwc"
ENV RUST_LOG="coop_boss_access=info,tower_http=info"
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/coop-boss-access"]
