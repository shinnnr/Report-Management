FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Expose the port Railway assigns
EXPOSE $PORT

# Start with OpenSSL legacy provider enabled using shell
CMD ["sh", "-c", "export NODE_OPTIONS='--openssl-legacy-provider' && node dist/index.cjs"]
