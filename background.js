/* eslint-disable no-console */
/* global chrome */

const idealTokenTTL = '24h';
const tokenCheckAlarm = 'tokenCheck';

if (!chrome.browserAction) {
  chrome.browserAction = chrome.action;
}

refreshTokenListener();
setupIdleListener();

const storage = {
  storageGetterProvider: (storageType) => {
    return function (key, defaultValue) {
      return new Promise(function (resolve, reject) {
        try {
          chrome.storage[storageType].get([key], function (result) {
            const value = result[key] || defaultValue || null;
            resolve(value);
          });
        } catch (error) {
          reject(error);
        }
      });
    };
  },

  local: {
    get: (key, defaultValue) =>
      storage.storageGetterProvider('local')(key, defaultValue),
  },
  sync: {
    get: (key, defaultValue) =>
      storage.storageGetterProvider('sync')(key, defaultValue),
  },
};

class Vault {
  constructor(token, address) {
    this.token = token;
    this.address = address;
    this.base = `${this.address}/v1`;
  }

  async request(method, endpoint, content = null) {
    const res = await fetch(this.base + endpoint, {
      method: method.toUpperCase(),
      headers: {
        'X-Vault-Token': this.token,
        'Content-Type': 'application/json',
      },
      body: content != null ? JSON.stringify(content) : null,
    });

    if (!res.ok)
      throw new Error(
        `Error calling: ${method.toUpperCase()} ${
          this.base
        }${endpoint} -> HTTP ${res.status} - ${res.statusText}`
      );

    return await res.json();
  }

  list(endpoint) {
    return this.request('LIST', endpoint);
  }

  get(endpoint) {
    return this.request('GET', endpoint);
  }

  post(endpoint, content) {
    return this.request('POST', endpoint, content);
  }
}

function storePathComponents(storePath) {
  let path = 'secret/vaultPass';
  if (storePath && storePath.length > 0) {
    path = storePath;
  }
  const pathComponents = path.split('/');
  const storeRoot = pathComponents[0];
  const storeSubPath =
    pathComponents.length > 0 ? pathComponents.slice(1).join('/') : '';

  return {
    root: storeRoot,
    subPath: storeSubPath,
  };
}

function clearHostname(hostname) {
  const match = hostname.match(/^(www\.)?(.*)$/);

  return match[2] ? match[2] : match[1];
}

async function autoFillSecrets(message, sender) {
  const vaultToken = await storage.local.get('vaultToken');
  const vaultAddress = await storage.sync.get('vaultAddress');
  const secretList = await storage.sync.get('secrets', []);
  const storePath = await storage.sync.get('storePath');
  const storeComponents = storePathComponents(storePath);

  if (!vaultToken || !vaultAddress) return;

  const url = new URL(sender.tab.url);
  const hostname = clearHostname(url.hostname);

  const vault = new Vault(vaultToken, vaultAddress);

  let loginCount = 0;

  for (const secret of secretList) {
    const secretKeys = await vault.list(
      `/${storeComponents.root}/metadata/${storeComponents.subPath}/${secret}`
    );
    for (const key of secretKeys.data.keys) {
      const pattern = new RegExp(key);
      const patternMatches = pattern.test(hostname);
      // If the key is an exact match to the current hostname --> autofill
      if (hostname === clearHostname(key)) {
        const credentials = await vault.get(
          `/${storeComponents.root}/data/${storeComponents.subPath}/${secret}${key}`
        );

        chrome.tabs.sendMessage(sender.tab.id, {
          message: 'fill_creds',
          username: credentials.data.data.username,
          password: credentials.data.data.password,
        });
      }
      if (patternMatches) {
        loginCount++;
      }
    }
  }
  if (loginCount > 0) {
    chrome.browserAction.setBadgeText({ text: '*', tabId: sender.tab.id });
  }
}

async function renewToken(force = false) {
  const vaultToken = await storage.local.get('vaultToken');
  const vaultAddress = await storage.sync.get('vaultAddress');

  if (vaultToken) {
    try {
      const vault = new Vault(vaultToken, vaultAddress);
      const token = await vault.get('/auth/token/lookup-self');

      console.log(
        `${new Date().toLocaleString()} Token will expire in ${
          token.data.ttl
        } seconds`
      );
      if (token.data.ttl > 3600) {
        refreshTokenListener(1800);
      } else {
        refreshTokenListener((token.data.ttl / 2));
      }

      if (force || token.data.ttl <= 60) {
        console.log(`${new Date().toLocaleString()} Renewing Token...`);
        const newToken = await vault.post('/auth/token/renew-self', {
          increment: idealTokenTTL,
        });
        console.log(
          `${new Date().toLocaleString()} Token renewed. It will expire in ${
            newToken.auth.lease_duration
          } seconds`
        );
      }

      await chrome.browserAction.setBadgeBackgroundColor({ color: '#1c98ed' });
    } catch (e) {
      console.log(e);
      await chrome.browserAction.setBadgeBackgroundColor({ color: '#FF0000' });
      await chrome.browserAction.setBadgeText({ text: '!' });

      refreshTokenListener();
    }
  }
}

function refreshTokenListener(interval = 45) {
  chrome.alarms.get(tokenCheckAlarm, function(exists) {
    if (exists) {
      chrome.alarms.clear(tokenCheckAlarm);
    }
    
    chrome.alarms.create(tokenCheckAlarm, {
      delayInMinutes: interval / 60
    });
  });
}

function setupIdleListener() {
  if (!chrome.idle.onStateChanged.hasListener(newStateHandler)) {
    chrome.idle.onStateChanged.addListener(newStateHandler);
  }
}

async function newStateHandler(newState) {
  console.log(`${new Date().toLocaleString()} ${newState}`);
  if (newState === 'active') {
    await renewToken(false);
  }

  if (newState === 'locked') {
    await renewToken(true);
  }
}

chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name === tokenCheckAlarm) {
    await renewToken();
  }
})

chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message.type === 'auto_fill_secrets') {
    setupIdleListener();
    autoFillSecrets(message, sender).catch(console.error);
  }

  if (message.type === 'auto_renew_token') {
    refreshTokenListener();
  }
});
