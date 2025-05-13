/* eslint-disable no-console */
/* global browser Notify storePathComponents */

const notify = new Notify(document.querySelector('#notify'));
async function mainLoaded() {
  // get inputs from form elements, server URL, login and password
  const vaultServer = document.getElementById('serverBox');
  const login = document.getElementById('loginBox');
  const auth = document.getElementById('authMount');
  const storePathsContainer = document.getElementById('storePathsContainer');

  // put listener on login button
  document
    .getElementById('authButton')
    .addEventListener('click', authButtonClick, false);
  document
    .getElementById('tokenGrabber')
    .addEventListener('click', tokenGrabberClick, false);
  document
    .getElementById('logoutButton')
    .addEventListener('click', logout, false);

  const vaultServerAddress = (await browser.storage.sync.get('vaultAddress'))
    .vaultAddress;
  if (vaultServerAddress) {
    vaultServer.value = vaultServerAddress;
    vaultServer.parentNode.classList.add('is-dirty');
  }
  const username = (await browser.storage.sync.get('username')).username;
  if (username) {
    login.value = username;
    login.parentNode.classList.add('is-dirty');
  }
  const authMethod = (await browser.storage.sync.get('authMethod')).authMethod;
  if (authMethod) {
    auth.value = authMethod;
    auth.parentNode.classList.add('is-dirty');
  }

  const storePaths = (await browser.storage.sync.get('storePaths')).storePaths;

  storePathsContainer.innerHTML = ''; // clear container
  if (storePaths && storePaths.length > 0) {
    storePaths.forEach((path) => {
      addStorePathRow(path);
      storePathsContainer.parentNode.classList.add('is-dirty');
    });
  } else {
    // Default value if nothing is saved
    addStorePathRow('secret/VaultPass');
  }

  await browser.storage.sync.set({ storePaths: storePaths });

  const vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
  if (vaultToken) {
    try {
      await querySecrets(vaultServerAddress, vaultToken, null, storePaths);
    } catch (err) {
      notify.clear().error(err.message);
    }
  }
}

document
  .getElementById('addStorePathButton')
  .addEventListener('click', function (event) {
    event.preventDefault();
    addStorePathRow('');
  });

async function querySecrets(
  vaultServerAddress,
  vaultToken,
  policies,
  storePaths
) {
  // Hide login prompt if we already have a Token
  document.getElementById('login').style.display = 'none';
  document.getElementById('logout').style.display = 'block';
  notify.clear();
  if (policies) {
    notify.info(`Attached policies: <br />${policies.join('<br />')}`, {
      removeOption: true,
    });
  }

  // Creating a mapping to make sure we know which secrets belong to which store path
  let allSecretsMapping = [];

  // For each KV store path, list the secrets push a mapping object to allSecretsMapping
  for (const storePath of storePaths) {
    const storeComponents = storePathComponents(storePath);
    const url = `${vaultServerAddress}/v1/${storeComponents.root}/metadata/${storeComponents.subPath}`;
    const response = await fetch(url, {
      method: 'LIST',
      headers: {
        'X-Vault-Token': vaultToken,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const apiResponse = await response.json();
      notify.error(
        `Fetching secrets directories at "${storePath}" failed. ${apiResponse.errors.join('. ')}`
      );
      continue;
    }
    const keys = (await response.json()).data.keys;
    keys.forEach((key) => {
      allSecretsMapping.push({ name: key, storePath: storePath });
    });
  }

  // Creating a "combined" key for each mapping (storePath + '##' + name)
  // and use it to filter out duplicates, in case there are any.
  const seen = {};
  allSecretsMapping = allSecretsMapping.filter((mapping) => {
    const combined = getCombinedKey(mapping);
    if (seen[combined]) return false;
    seen[combined] = true;
    return true;
  });

  let activeSecrets = (await browser.storage.sync.get('secrets')).secrets || [];
  const validKeys = new Set(allSecretsMapping.map(getCombinedKey));
  activeSecrets = activeSecrets.filter(k => validKeys.has(k));

  await browser.storage.sync.set({ secrets: activeSecrets });
  await displaySecrets(allSecretsMapping, activeSecrets);
}

async function logout() {
  // reset the UI
  document.getElementById('secretList').innerHTML = '';

  document.getElementById('login').style.display = 'block';
  document.getElementById('logout').style.display = 'none';
  document.getElementById('secretList').innerHTML = '';

  const vaultServerAddress = (await browser.storage.sync.get('vaultAddress'))
    .vaultAddress;
  const vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
  if (vaultToken) {
    try {
      await fetch(`${vaultServerAddress}/v1/auth/token/revoke-self`, {
        method: 'POST',
        'X-Vault-Token': vaultToken,
        'Content-Type': 'application/json',
      });
    } catch (err) {
      notify.clear().error(err.message);
    }
  }

  notify.clear().success('logged out', { time: 1000, removeOption: false });
  await browser.storage.local.set({ vaultToken: null });
}

async function displaySecrets(secretsMapping, activeSecrets) {
  const list = document.getElementById('secretList');
  list.innerHTML = '';

  for (const mapping of secretsMapping) {
    const item = document.createElement('li');
    item.classList.add('list__item');

    const label = document.createElement('label');
    label.classList.add('list__item-button');
    item.appendChild(label);

    const primaryContent = document.createElement('span');
    primaryContent.classList.add('list__item-text-title');
    label.appendChild(primaryContent);
    primaryContent.innerText = `${mapping.name} (${mapping.storePath})`;

    const secondaryContent = document.createElement('span');
    secondaryContent.classList.add('list__item-text-body');
    secondaryContent.innerText = 'Active ';
    label.appendChild(secondaryContent);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = 1;

    const combinedKey = getCombinedKey(mapping);
    checkbox.name = combinedKey;
    checkbox.checked = activeSecrets.indexOf(combinedKey) > -1;
    checkbox.addEventListener('change', (event) =>
      secretChanged({ event, checkbox, item, secretMapping: mapping })
    );
    secondaryContent.appendChild(checkbox);

    list.appendChild(item);
  }
}

async function secretChanged({ checkbox, item, secretMapping }) {
  let activeSecrets = (await browser.storage.sync.get('secrets')).secrets;
  if (!activeSecrets) {
    activeSecrets = [];
  }

  const combinedKey = getCombinedKey(secretMapping);

  if (checkbox.checked) {
    const vaultServerAddress = (await browser.storage.sync.get('vaultAddress'))
      .vaultAddress;
    const vaultToken = (await browser.storage.local.get('vaultToken'))
      .vaultToken;
    if (!vaultToken) {
      throw new Error('secretChanged: Vault Token is empty after login');
    }

    const storeComponents = storePathComponents(secretMapping.storePath);
    const fetchListOfSecretsForDir = await fetch(
      `${vaultServerAddress}/v1/${storeComponents.root}/metadata/${storeComponents.subPath}/${secretMapping.name}`,
      {
        method: 'LIST',
        headers: {
          'X-Vault-Token': vaultToken,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!fetchListOfSecretsForDir.ok) {
      checkbox.checked = false;
      checkbox.disabled = true;
      item.classList.add('disabled');
      throw new Error(
        `ERROR accessing this field: ${await fetchListOfSecretsForDir.text()}".`
      );
    }
    if (activeSecrets.indexOf(combinedKey) < 0) {
      activeSecrets.push(combinedKey);
    }
  } else {
    activeSecrets = activeSecrets.filter((key) => key !== combinedKey);
  }

  await browser.storage.sync.set({ secrets: activeSecrets });
}

// invoked after user clicks "login to vault" button, if all fields filled in, and URL passed regexp check.
async function authToVault(
  vaultServer,
  username,
  password,
  authMethod,
  storePaths
) {
  const apiResponse = await fetch(
    `${vaultServer}/v1/auth/${authMethod}/login/${username}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: password }),
    }
  );
  if (!apiResponse.ok) {
    notify.error(`
      There was an error while calling<br>
      ${vaultServer}/v1/auth/${authMethod}/login/${username}<br>
      Please check if your username, password and authentication method are correct.
    `);
    return;
  }
  const authInfo = (await apiResponse.json()).auth;
  const token = authInfo.client_token;
  await browser.storage.local.set({ vaultToken: token });
  await querySecrets(vaultServer, token, authInfo.policies, storePaths);

  browser.runtime.sendMessage({
    type: 'auto_renew_token',
  });

  // If token expires in less than 24 hour, try to extend it to avoid having to re-logon too often
  if (authInfo.lease_duration < 86400) {
    await fetch(`${vaultServer}/v1/auth/token/renew-self`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Token': token,
      },
      body: JSON.stringify({ increment: '24h' }),
    });
  }
}

async function authButtonClick() {
  // get inputs from form elements, server URL, login and password
  const vaultServer = document.getElementById('serverBox');
  const login = document.getElementById('loginBox');
  const authMount = document.getElementById('authMount');
  const pass = document.getElementById('passBox');

  const storePathsContainer = document.getElementById('storePathsContainer');
  const storePathInputs =
    storePathsContainer.querySelectorAll('input.store-path');

  const storePaths = collectStorePaths();

  // verify input not empty. TODO: verify correct URL format.
  if (
    vaultServer.value.length > 0 &&
    login.value.length > 0 &&
    pass.value.length > 0
  ) {
    // if input fields are not empty, attempt authorization to specified vault server URL.
    await browser.storage.sync.set({ vaultAddress: vaultServer.value });
    await browser.storage.sync.set({ username: login.value });
    await browser.storage.sync.set({ authMethod: authMount.value });
    await browser.storage.sync.set({ storePaths: storePaths });
    try {
      await authToVault(
        vaultServer.value,
        login.value,
        pass.value,
        authMount.value,
        storePaths
      );
    } catch (err) {
      notify.clear().error(err.message);
    }
  } else {
    notify.error('Bad input, must fill in all 3 fields.');
  }
}

async function tokenGrabberClick() {
  const storePaths = collectStorePaths();
  await browser.storage.sync.set({ storePaths: storePaths });

  const vaultServer = document.getElementById('serverBox');
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  try {
    await browser.tabs.sendMessage(currentTab.id, { message: 'fetch_token' });
  } catch (err) {
    if (
      !currentTab ||
      !currentTab.url ||
      !currentTab.url.startsWith(vaultServer.value)
    ) {
      notify
        .clear()
        .error(
          `Please navigate to ${vaultServer.value} before grabbing the token.`
        );
      return;
    } else {
      notify.clear().error(err.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', mainLoaded, false);

browser.runtime.onMessage.addListener(async function (message) {
  switch (message.type) {
    case 'fetch_token': {
      await browser.storage.local.set({ vaultToken: message.token });
      await browser.storage.sync.set({ vaultAddress: message.address });
      const storePaths = (await browser.storage.sync.get('storePaths'))
        .storePaths;
      await querySecrets(
        message.address,
        message.token,
        message.policies,
        storePaths
      );
      break;
    }
    case 'token_missing':
      notify.error('Failed to find Vault info from current tab');
      break;
    default:
      break;
  }
});

function getCombinedKey(mapping) {
  return mapping.storePath + '##' + mapping.name;
}

function addStorePathRow(pathValue = '') {
  const kvItem = document.createElement('div');
  kvItem.className = 'kv-item';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input store-path kv-path';
  input.placeholder = 'Path to the KV store within Vault';
  input.value = pathValue;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'kv-remove';
  removeButton.innerText = 'Remove';

  removeButton.addEventListener('click', () => {
    kvItem.remove();
    saveStorePaths();
  });

  kvItem.appendChild(input);
  kvItem.appendChild(removeButton);

  const container = document.getElementById('storePathsContainer');
  container.appendChild(kvItem);
}

function collectStorePaths() {
  const storePathsContainer = document.getElementById('storePathsContainer');
  const storePathInputs =
    storePathsContainer.querySelectorAll('input.store-path');

  const storePaths = [];
  storePathInputs.forEach((input) => {
    let path = input.value.trim();
    if (path.length > 0) {
      // remove leading slash if present
      if (path[0] === '/') {
        path = path.substring(1);
      }
      storePaths.push(path);
    }
  });
  return storePaths;
}

function saveStorePaths() {
  const storePaths = collectStorePaths();
  browser.storage.sync.set({ storePaths: storePaths });
}
