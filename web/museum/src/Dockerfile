FROM node:26-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN node seed.js gallery
ENV FLAG=skbdg{replaceme}
ENV PORT=1337
EXPOSE 1337
CMD ["node", "index.js"]