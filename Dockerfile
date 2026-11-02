FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# App source. Keys are never copied in; they arrive via volume or env at runtime.
COPY src ./src
COPY config ./config

# Output lives on a mounted volume so raw data survives the container.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# Dry run by default. Live sending needs LIVE=true plus a funding key.
ENTRYPOINT ["node", "src/index.js"]
CMD ["all"]
