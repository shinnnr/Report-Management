FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Set OpenSSL legacy provider environment variable
ENV NODE_OPTIONS="--openssl-legacy-provider"

# Expose the port Railway assigns
EXPOSE $PORT

# Start the server
CMD ["node", "dist/index.cjs"]
