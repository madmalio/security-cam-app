# Stage 1: Builder
# --- FIX: Upgrade to 1.24 to support latest Docker SDK ---
FROM golang:1.24-bookworm AS builder

WORKDIR /app

# Copy go module files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Ensure dependencies match code
RUN go mod tidy

# Build the binary
RUN go build -o nvr-server ./cmd/server

# Stage 2: Runner
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    motion \
    curl \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /root/

# Copy binary from builder
COPY --from=builder /app/nvr-server .

# Create directories
RUN mkdir -p /recordings
RUN mkdir -p /var/log/motion
RUN mkdir -p /app/motion_confs

# Expose API port
EXPOSE 8080

# Run
CMD ["./nvr-server"]