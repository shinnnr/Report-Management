FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Expose the port Railway assigns
EXPOSE $PORT

# Install cross-env for setting NODE_OPTIONS reliably
RUN npm install --no-save cross-env

# Start with OpenSSL legacy provider enabled
CMD ["npx", "cross-env", "NODE_OPTIONS=--openssl-legacy-provider", "node", "dist/index.cjs"]