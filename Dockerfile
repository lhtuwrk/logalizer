FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --prefix server && npm install --prefix client
COPY . .
RUN npm run build --prefix client

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5174
COPY --from=build /app/server /app/server
COPY --from=build /app/client/dist /app/client/dist
COPY --from=build /app/sample /app/sample
WORKDIR /app/server
RUN npm install --omit=dev
EXPOSE 5174
CMD ["node", "src/index.js"]
