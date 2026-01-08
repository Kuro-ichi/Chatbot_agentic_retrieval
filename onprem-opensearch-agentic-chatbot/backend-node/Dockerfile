FROM node:20-alpine

WORKDIR /app
COPY package.json ./
# Keep it simple (no package-lock required)
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","start"]
