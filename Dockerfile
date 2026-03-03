FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Clear npm cache and force fresh install
RUN npm cache clean --force

RUN npm ci

COPY . .

RUN npm run build

# Expose the port Railway assigns
EXPOSE $PORT

# Start the server
CMD ["node", "dist/index.cjs"]
