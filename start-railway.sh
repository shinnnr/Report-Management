#!/bin/sh
# Start script for Railway with OpenSSL legacy provider
export NODE_OPTIONS="--openssl-legacy-provider"
exec node dist/index.cjs
