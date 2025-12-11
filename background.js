/* global URL */
importScripts('browser-polyfill.min.js');

// Manifest V3 uses browser.action instead of browserAction
if (!browser.browserAction) {
  browser.browserAction = browser.action;
}

const idealTokenTTL = '24h';
const tokenCheckAlarm = 'tokenCheck';
const tokenRenewAlarm = 'tokenRenew';

// Manifest V3 uses browser.action instead of browserAction

setupTokenAutoRenew(1800);
refreshTokenTimer();
setupIdleListener();

const storage = {
  storageGetterProvider: (storageType) => {
    return function (key, defaultValue) {
      return new Promise(function (resolve, reject) {
        try {
          browser.storage[storageType]
            .get([key])
            .then(function (result) {
              const value = result[key] || defaultValue || null;
              resolve(value);
            })
            .catch((error) => {
              reject(error);
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

  const matches = [];

  for (const secret of secretList) {
    const secretKeys = await vault.list(
      `/${storeComponents.root}/metadata/${storeComponents.subPath}/${secret}`
    );
    for (const key of secretKeys.data.keys) {
      const pattern = new RegExp(key);
      const patternMatches = pattern.test(hostname);

      // Add entries to array if the hostname is a match
      if (hostname === clearHostname(key)) {
        const credentials = await vault.get(
          `/${storeComponents.root}/data/${storeComponents.subPath}/${secret}${key}`
        );

        matches.push({
          organization: secret,
          secret: key,
          username: credentials.data.data.username,
          password: credentials.data.data.password,
          comment: credentials.data.data.comment,
        });
      }
      if (patternMatches) {
        loginCount++;
      }
    }
  }
  if (loginCount > 0) {
    browser.browserAction.setBadgeText({ text: '*', tabId: sender.tab.id });
  }

  // If there is only one match, fill the credentials, otherwise prompt the user
  if (matches.length === 1) {
    const m = matches[0];
    browser.tabs.sendMessage(sender.tab.id, {
      message: 'fill_creds',
      username: m.username,
      password: m.password,
    });
  } else if (matches.length > 1) {
    promptUserForChoice(matches, sender.tab.id);
  }
}

function promptUserForChoice(matches, tabId) {
  browser.tabs.sendMessage(tabId, {
    type: 'show_matches_popup_iframe',
    matches: matches,
  });
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
          token.data.ttl / 60
        } minutes`
      );
      if (token.data.ttl > 3600) {
        refreshTokenTimer(1800);
      } else {
        refreshTokenTimer(token.data.ttl / 2);
      }

      if (force || token.data.ttl <= 600) {
        console.log(`${new Date().toLocaleString()} Renewing Token...`);
        const newToken = await vault.post('/auth/token/renew-self', {
          increment: idealTokenTTL,
        });
        console.log(
          `${new Date().toLocaleString()} Token renewed. It will expire in ${
            newToken.auth.lease_duration / 60
          } minutes`
        );
      }

      await browser.browserAction.setBadgeBackgroundColor({ color: '#1c98ed' });
    } catch (e) {
      console.log(e);
      await browser.browserAction.setBadgeBackgroundColor({ color: '#FF0000' });
      await browser.browserAction.setBadgeText({ text: '!' });

      refreshTokenTimer();
    }
  }
}

function setupTokenAutoRenew(interval = 1800) {
  browser.alarms.get(tokenRenewAlarm).then((alarm) => {
    if (alarm) {
      browser.alarms.clear(tokenRenewAlarm);
    }

    browser.alarms.create(tokenRenewAlarm, {
      periodInMinutes: interval / 60,
    });
  });
}

function refreshTokenTimer(delay = 45) {
  browser.alarms.get(tokenCheckAlarm).then((alarm) => {
    if (alarm) {
      browser.alarms.clear(tokenCheckAlarm);
    }

    browser.alarms.create(tokenCheckAlarm, {
      delayInMinutes: delay / 60,
    });
  });
}

function setupIdleListener() {
  if (!browser.idle.onStateChanged.hasListener(newStateHandler)) {
    browser.idle.onStateChanged.addListener(newStateHandler);
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

browser.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name === tokenCheckAlarm) {
    await renewToken();
  }

  if (alarm.name === tokenRenewAlarm) {
    await renewToken(true);
  }
});

browser.runtime.onMessage.addListener(function (message, sender) {
  if (message.type === 'auto_fill_secrets') {
    setupIdleListener();
    autoFillSecrets(message, sender).catch(console.error);
  }

  if (message.type === 'auto_renew_token') {
    refreshTokenTimer();
  }
});

// Listener to catch the fill_creds message and then forward it to the active tab
browser.runtime.onMessage.addListener((request) => {
  if (request.message === 'fill_creds') {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length) {
        browser.tabs.sendMessage(tabs[0].id, request);
      }
    });
  }

  if (request.type === 'start_web_login_flow') {
    startWebLoginFlow(request.vaultServer);
  }
});

async function startWebLoginFlow(vaultServer) {
  const loginUrl = `${vaultServer}/ui/vault/auth`;
  const tab = await browser.tabs.create({ url: loginUrl });

  const pollInterval = 2000; // 2 seconds
  const maxPolls = 150; // 5 minutes total
  let pollCount = 0;

  const poller = setInterval(async () => {
    pollCount++;
    if (pollCount > maxPolls) {
      clearInterval(poller);
      // notify user somehow? (cannot notify popup if closed)
      return;
    }

    try {
      // Check if tab is still open
      const currentTab = await browser.tabs.get(tab.id);
      if (!currentTab) {
        clearInterval(poller);
        return;
      }

      // Try to fetch token
      await browser.tabs.sendMessage(tab.id, { message: 'fetch_token' });
    } catch {
      // Ignore errors while polling
    }
  }, pollInterval);

  // Listener to stop polling when token is found
  const tokenListener = async (message) => {
    if (message.type === 'fetch_token') {
      clearInterval(poller);
      browser.runtime.onMessage.removeListener(tokenListener);

      // Token found! Process it just like options.js would have
      await browser.storage.local.set({ vaultToken: message.token });
      await browser.storage.sync.set({ vaultAddress: message.address });

      // Start auto-renew
      browser.alarms.create(tokenCheckAlarm, {
        delayInMinutes: 45 / 60,
      });
      await renewToken();

      // We need to notify options page if it's open, but mostly just saving it is enough
      // The user will see they are logged in next time they open popup/options
      console.log('login successful via background script');
    }
  };
  browser.runtime.onMessage.addListener(tokenListener);
}
