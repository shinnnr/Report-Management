FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Expose the port Railway assigns
EXPOSE $PORT

# Start with OpenSSL legacy provider enabled
CMD ["sh", "-c", "NODE_OPTIONS='--openssl-legacy-provider' node dist/index.cjs"]