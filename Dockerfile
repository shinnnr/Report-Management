FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Set Node.js options for OpenSSL legacy provider (needed for google-auth-library)
ENV NODE_OPTIONS="--openssl-legacy-provider"

# Expose the port Railway assigns
EXPOSE $PORT

CMD ["npm", "start"]