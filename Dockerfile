FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

# Run as a non-root user
RUN addgroup -S synch && adduser -S synch -G synch
USER synch

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000/404 >/dev/null 2>&1 || exit 1

CMD ["node", "backend/server.js"]
