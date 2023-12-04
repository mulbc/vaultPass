/* eslint-disable no-console */
/* global browser Notify storePathComponents */

const notify = new Notify(document.querySelector('#notify'));
async function mainLoaded() {
  // get inputs from form elements, server URL, login and password
  const vaultServer = document.getElementById('serverBox');
  const login = document.getElementById('loginBox');
  const auth = document.getElementById('authMount');
  const store = document.getElementById('storeBox');

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
  const storePath = (await browser.storage.sync.get('storePath')).storePath;
  if (storePath) {
    store.value = storePath;
    store.parentNode.classList.add('is-dirty');
  }
  const vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
  if (vaultToken) {
    try {
      await querySecrets(vaultServerAddress, vaultToken, null, storePath);
    } catch (err) {
      notify.clear().error(err.message);
    }
  }
}

async function querySecrets(
  vaultServerAddress,
  vaultToken,
  policies,
  storePath
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

  const fetchListOfSecretDirs = await vaultApiCall('LIST', 'metadata', '',
      `Fetching secrets directories at "${storePath}" failed`);

  let activeSecrets = (await browser.storage.sync.get('secrets')).secrets || [];

  const availableSecrets = (await fetchListOfSecretDirs.json()).data.keys;
  activeSecrets = activeSecrets.filter((x) => availableSecrets.indexOf(x) !== -1);
  await browser.storage.sync.set({ secrets: activeSecrets });
  await displaySecrets(availableSecrets, activeSecrets);
}

async function logout() {
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

async function displaySecrets(secrets, activeSecrets) {
  const list = document.getElementById('secretList');

  for (const secret of secrets) {
    // Create the list item:
    const item = document.createElement('li');
    item.classList.add('list__item');

    const label = document.createElement('label');
    label.classList.add('list__item-button');
    item.appendChild(label);

    const primaryContent = document.createElement('span');
    primaryContent.classList.add('list__item-text-title');
    label.appendChild(primaryContent);
    primaryContent.innerText = secret;

    const secondaryContent = document.createElement('span');
    secondaryContent.classList.add('list__item-text-body');
    secondaryContent.innerText = 'Active ';
    label.appendChild(secondaryContent);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = 1;
    checkbox.name = secret;
    checkbox.checked = activeSecrets.indexOf(secret) > -1;
    checkbox.addEventListener('change', (event) =>
      secretChanged({ event, checkbox, item })
    );
    secondaryContent.appendChild(checkbox);

    // Add it to the list:
    list.appendChild(item);
  }
}

async function secretChanged({ checkbox, item }) {
  let activeSecrets = (await browser.storage.sync.get('secrets')).secrets || [];

  if (checkbox.checked) {
    const vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
    if (!vaultToken) {
      throw new Error('secretChanged: Vault Token is empty after login');
    }
    const fetchListOfSecretsForDir = await vaultApiCall('LIST', 'metadata', checkbox.name);
    if (!fetchListOfSecretsForDir.ok) {
      checkbox.checked = false;
      checkbox.disabled = true;
      item.classList.add('disabled');
      throw new Error(
        `ERROR accessing this field: ${await fetchListOfSecretsForDir.text()}`
      );
    }
    if (activeSecrets.indexOf(checkbox.name) < 0) {
      activeSecrets.push(checkbox.name);
    }
    await browser.storage.sync.set({ secrets: activeSecrets });
  } else {
    for (
      let index = activeSecrets.indexOf(checkbox.name);
      index > -1;
      index = activeSecrets.indexOf(checkbox.name)
    ) {
      activeSecrets.splice(index, 1);
    }
    await browser.storage.sync.set({ secrets: activeSecrets });
  }
}

// invoked after user clicks "login to vault" button, if all fields filled in, and URL passed regexp check.
async function authToVault(
  vaultServer,
  username,
  password,
  authMethod,
  storePath
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
  await querySecrets(vaultServer, token, authInfo.policies, storePath);

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
  const storePath = document.getElementById('storeBox');
  // verify input not empty. TODO: verify correct URL format.
  if (
    vaultServer.value.length > 0 &&
    login.value.length > 0 &&
    pass.value.length > 0
  ) {
    if (storePath.value.length > 0 && storePath.value[0] === '/') {
      storePath.value = storePath.value.substring(1);
    }

    // if input fields are not empty, attempt authorization to specified vault server URL.
    await browser.storage.sync.set({ vaultAddress: vaultServer.value });
    await browser.storage.sync.set({ username: login.value });
    await browser.storage.sync.set({ authMethod: authMount.value });
    await browser.storage.sync.set({ storePath: storePath.value });
    try {
      await authToVault(
        vaultServer.value,
        login.value,
        pass.value,
        authMount.value,
        storePath.value
      );
    } catch (err) {
      notify.clear().error(err.message);
    }
  } else {
    notify.error('Bad input, must fill in all 3 fields.');
  }
}

async function tokenGrabberClick() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
    const tab = tabs[tabIndex];
    if (tab.url) {
      browser.tabs.sendMessage(tab.id, {
        message: 'fetch_token',
      });
      break;
    }
  }
}

document.addEventListener('DOMContentLoaded', mainLoaded, false);

browser.runtime.onMessage.addListener(async function (message) {
  switch (message.type) {
    case 'fetch_token': {
      await browser.storage.local.set({ vaultToken: message.token });
      await browser.storage.sync.set({ vaultAddress: message.address });
      const storePath = (await browser.storage.sync.get('storePath')).storePath;
      await querySecrets(
        message.address,
        message.token,
        message.policies,
        storePath
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
