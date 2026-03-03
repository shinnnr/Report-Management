FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Expose the port Railway assigns
EXPOSE $PORT

# Start the server
CMD ["node", "dist/index.cjs"]
