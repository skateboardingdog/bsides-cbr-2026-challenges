FROM node:20-alpine AS webbuild
WORKDIR /app
COPY frontend/webapp/package.json ./
COPY frontend/webapp/ ./
RUN npm install

RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY frontend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY frontend/api.py .
COPY --from=webbuild /app/dist /app/static

COPY victim/chal1.py victim/chal2.py victim/chal3.py victim/chal4.py ./sources/

EXPOSE 80
CMD ["gunicorn", "-k", "gthread", "-w", "2", "--threads", "8", "-b", "0.0.0.0:80", "api:app"]
