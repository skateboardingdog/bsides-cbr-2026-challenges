#!/bin/bash

SECRETS_FILE=/app/.secrets.env
[ -f "$SECRETS_FILE" ] && . "$SECRETS_FILE"
export JWT_SECRET="${JWT_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
export API_KEY="${API_KEY:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
cat > "$SECRETS_FILE" <<EOF
export JWT_SECRET=$JWT_SECRET
export API_KEY=$API_KEY
EOF

cp /opt/background.js.tmpl /opt/gridadmin-extension/background.js
sed -i "s/__API_KEY__/${API_KEY}/g" /opt/gridadmin-extension/background.js

chmod +x /opt/pshost.py

mkdir -p /tmp/chromium-profile

uvicorn app:app --host 0.0.0.0 --port 8000 --workers 2 &

sleep 2

chromium --headless=new --no-sandbox --disable-gpu \
  --user-data-dir=/tmp/chromium-profile \
  --enable-remote-extensions \
  --load-extension=/opt/gridadmin-extension \
  --disable-dev-shm-usage \
  --enable-logging=stderr --v=1 \
  &

wait -n
exit 1
