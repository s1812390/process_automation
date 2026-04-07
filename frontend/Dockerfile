# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
ARG VITE_BASE_PATH=/scheduler/
ARG VITE_COMMIT_COUNT=0
ARG VITE_COMMIT_MESSAGE=""
RUN VITE_BASE_PATH=$VITE_BASE_PATH \
    VITE_COMMIT_COUNT=$VITE_COMMIT_COUNT \
    VITE_COMMIT_MESSAGE="$VITE_COMMIT_MESSAGE" \
    npm run build

# Stage 2 — serve via nginx
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
