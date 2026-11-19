FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json tsconfig*.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
COPY data ./data
COPY scripts ./scripts
COPY public ./public
COPY tests ./tests
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data
COPY --from=builder /app/public ./public
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server/server.js"]
