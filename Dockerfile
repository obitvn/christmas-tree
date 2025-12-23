  FROM node:20-alpine

  WORKDIR /app

  COPY package.json package-lock.json ./
  RUN npm install
  COPY . .

  EXPOSE 8080
  ENV NODE_ENV=production

  CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]
