/* eslint-disable no-console */
/* global chrome */

function storageGetterProvider(storageType) {
  return function (key, defaultValue) {
    return new Promise(function(resolve, reject) {
      try {
        chrome.storage[storageType].get([key], function(result) {
          const value = result[key] || defaultValue || null;
          resolve(value);
        });
      } catch (error) {
        reject(error);
      }
    });
  };
}

const storage = {
  local: {
    get: storageGetterProvider('local'),
  },
  sync: {
    get: storageGetterProvider('sync'),
  },
};

class Vault {
  constructor(token, address) {
    this.token = token;
    this.address = address;
    this.base = `${this.address}/v1`;
  }

  async request(method, endpoint) {
    const res = await fetch(this.base + endpoint, {
      method: method.toUpperCase(),
      headers: {
        'X-Vault-Token': this.token,
        'Content-Type': 'application/json'
      },
    });

    if (!res.ok) throw new Error(`Something wrong: ${res.statusText}`);

    const json = await res.json();

    return json;
  }

  list(endpoint) {
    return this.request('LIST', endpoint);
  }

  get(endpoint) {
    return this.request('GET', endpoint);
  }
}

function clearHostname(hostname) {
  const match = hostname.match(/^(www\.)?(.*)$/);

  return match[2] ? match[2] : match[1];
}

async function autoFillSecrets(message, sender) {
  const vaultToken = await storage.local.get('vaultToken');
  const vaultAddress = await storage.sync.get('vaultAddress');
  const secretList = await storage.sync.get('secrets', []);

  if (!vaultAddress || !vaultAddress) return;

  const url = new URL(sender.tab.url);
  const hostname = clearHostname(url.hostname);

  const vault = new Vault(vaultToken, vaultAddress);

  for (let secret of secretList) {
    const secretKeys = await vault.list(`/secret/metadata/vaultPass/${secret}`);
    for (let key of secretKeys.data.keys) {
      if (hostname === clearHostname(key)) {
        const credentials = await vault.get(`/secret/data/vaultPass/${secret}${key}`);

        chrome.tabs.sendMessage(sender.tab.id, {
          message: 'fill_creds',
          username: credentials.data.data.username,
          password: credentials.data.data.password,
        });

        return;
      }
    }
  }
}

chrome.runtime.onMessage.addListener(function(message, sender) {
  if (message.type === 'auto_fill_secrets') {
    autoFillSecrets(message, sender);
  }
});

// chrome.webNavigation.onCompleted.addListener(function(details) {
// }, {
//   url: [
//     { schemes: ['https', 'http'] }
//   ]
// });
