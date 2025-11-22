FROM golang:1.24-bookworm AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go mod tidy
RUN go build -o nvr-server ./cmd/server

FROM debian:bookworm-slim

# --- FIX: Removed 'motion' ---
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# -----------------------------

WORKDIR /root/
COPY --from=builder /app/nvr-server .

RUN mkdir -p /recordings

EXPOSE 8080
CMD ["./nvr-server"]