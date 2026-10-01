FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    chromium \
    curl \
    gnupg \
    wget \
    apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

RUN wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y powershell \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY flag.txt /flag.txt

COPY host/pshost.py /opt/pshost.py
RUN chmod +x /opt/pshost.py

RUN mkdir -p /etc/chromium/native-messaging-hosts
COPY host/com.gridadmin.pshost.json /etc/chromium/native-messaging-hosts/

COPY extension/ /opt/gridadmin-extension/
RUN cp /opt/gridadmin-extension/background.js /opt/background.js.tmpl

COPY entry.sh /entry.sh
RUN chmod +x /entry.sh

COPY app.py .

EXPOSE 8000
CMD ["/entry.sh"]
