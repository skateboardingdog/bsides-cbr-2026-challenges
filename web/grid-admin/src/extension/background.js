const API = 'http://127.0.0.1:8000';
const POLL_ALARM = 'poll-messages';
const POLL_MINUTES = 0.17; // ~10 seconds

const API_KEY = '__API_KEY__';

function processMessage(msg) {
  return new Promise((resolve) => {
    let reply = null;
    let settled = false;

    const done = (value) => {
      if (!settled) {
        settled = true;
        reply = value;
        resolve(value);
      }
    };

    try {
      const port = chrome.runtime.connectNative('com.gridadmin.pshost');

      port.onMessage.addListener((response) => {
        done(typeof response === 'string' ? response : JSON.stringify(response));
        port.disconnect();
      });

      port.onDisconnect.addListener(() => {
        if (!settled) {
          done('(no valid response)');
        }
      });

      port.postMessage(msg.content);
    } catch (e) {
      done(`(error: ${e.message})`);
    }
  });
}

async function postReply(messageId, reply) {
  try {
    await fetch(`${API}/api/admin/reply`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message_id: messageId, reply: reply })
    });
    console.log(`[grid-admin] reply posted for msg #${messageId}`);
  } catch (e) {
    console.error(`[grid-admin] failed to post reply for #${messageId}:`, e);
  }
}

async function poll() {
  try {
    const res = await fetch(`${API}/api/admin/messages`, {
      headers: { 'X-API-Key': API_KEY }
    });
    if (!res.ok) return;

    const messages = await res.json();
    console.log(`[grid-admin] poll: ${messages.length} pending`);
    for (const msg of messages) {
      console.log(`[grid-admin] processing msg #${msg.id}...`);
      const reply = await processMessage(msg);
      console.log(`[grid-admin] reply for #${msg.id}: ${reply.substring(0, 80)}`);
      await postReply(msg.id, reply);
    }
  } catch (e) {
    console.error('[grid-admin] poll error:', e);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) poll();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[grid-admin] extension installed');
  chrome.alarms.create(POLL_ALARM, { delayInMinutes: 0.1, periodInMinutes: POLL_MINUTES });
  poll();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { delayInMinutes: 0.1, periodInMinutes: POLL_MINUTES });
  poll();
});

chrome.alarms.create(POLL_ALARM, { delayInMinutes: 0.1, periodInMinutes: POLL_MINUTES });
poll();
