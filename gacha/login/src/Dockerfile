FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY patches ./patches
RUN apk add --no-cache patch \
    && patch -p1 -d node_modules/jsonwebtoken < patches/jsonwebtoken@9.0.3.patch

ENV FLAG=skbdg{pAwsW0rds_N0t_Acc3pt3d:(}

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
