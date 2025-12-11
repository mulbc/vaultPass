/* global Notify storePathComponents */

const notify = new Notify(document.querySelector('#notify'));
async function mainLoaded() {
  // get inputs from form elements, server URL, login and password
  const vaultServer = document.getElementById('serverBox');
  const store = document.getElementById('storeBox');

  // put listener on login button
  document
    .getElementById('webLoginButton')
    .addEventListener('click', webLoginButtonClick, false);
  document
    .getElementById('saveTokenButton')
    .addEventListener('click', saveManualTokenClick, false);
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

  const storeComponents = storePathComponents(storePath);

  const fetchListOfSecretDirs = await fetch(
    `${vaultServerAddress}/v1/${storeComponents.root}/metadata/${storeComponents.subPath}`,
    {
      method: 'LIST',
      headers: {
        'X-Vault-Token': vaultToken,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!fetchListOfSecretDirs.ok) {
    const apiResponse = await fetchListOfSecretDirs.json();
    notify.error(
      `Fetching secrets directories at "${storePath}" failed. ${apiResponse.errors.join(
        '. '
      )}`
    );
    return;
  }

  let activeSecrets = (await browser.storage.sync.get('secrets')).secrets;
  if (!activeSecrets) {
    activeSecrets = [];
  }

  const availableSecrets = (await fetchListOfSecretDirs.json()).data.keys;
  activeSecrets = activeSecrets.filter(
    (x) => availableSecrets.indexOf(x) !== -1
  );
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
  let activeSecrets = (await browser.storage.sync.get('secrets')).secrets;
  if (!activeSecrets) {
    activeSecrets = [];
  }

  if (checkbox.checked) {
    const vaultServerAddress = (await browser.storage.sync.get('vaultAddress'))
      .vaultAddress;
    const vaultToken = (await browser.storage.local.get('vaultToken'))
      .vaultToken;
    if (!vaultToken) {
      throw new Error('secretChanged: Vault Token is empty after login');
    }

    const storePath = (await browser.storage.sync.get('storePath')).storePath;
    const storeComponents = storePathComponents(storePath);
    const fetchListOfSecretsForDir = await fetch(
      `${vaultServerAddress}/v1/${storeComponents.root}/metadata/${storeComponents.subPath}/${checkbox.name}`,
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

// Function removed (no longer used)

async function webLoginButtonClick() {
  const vaultServer = document.getElementById('serverBox');
  const storePath = document.getElementById('storeBox');

  if (vaultServer.value.length > 0) {
    if (storePath.value.length > 0 && storePath.value[0] === '/') {
      storePath.value = storePath.value.substring(1);
    }

    await browser.storage.sync.set({ vaultAddress: vaultServer.value });
    await browser.storage.sync.set({ storePath: storePath.value });

    // Start flow in background script
    browser.runtime.sendMessage({
      type: 'start_web_login_flow',
      vaultServer: vaultServer.value,
    });
    notify.info('Web login started in new tab...', { removeOption: false });
  } else {
    notify.error('Please enter Vault Server URL.');
  }
}

async function saveManualTokenClick() {
  const vaultServer = document.getElementById('serverBox');
  const storePath = document.getElementById('storeBox');
  const manualToken = document.getElementById('manualTokenBox');

  if (vaultServer.value.length > 0 && manualToken.value.length > 0) {
    if (storePath.value.length > 0 && storePath.value[0] === '/') {
      storePath.value = storePath.value.substring(1);
    }

    await browser.storage.sync.set({ vaultAddress: vaultServer.value });
    await browser.storage.sync.set({ storePath: storePath.value });
    await browser.storage.local.set({ vaultToken: manualToken.value });

    try {
      await querySecrets(
        vaultServer.value,
        manualToken.value,
        null,
        storePath.value
      );
      notify.success('Token saved successfully!');
      // Start auto-renew just in case
      browser.runtime.sendMessage({ type: 'auto_renew_token' });
    } catch (err) {
      notify.clear().error(err.message);
    }
  } else {
    notify.error('Please enter Vault Server URL and Token.');
  }
}

async function tokenGrabberClick() {
  const storePath = document.getElementById('storeBox');
  if (storePath.value.length > 0 && storePath.value[0] === '/') {
    storePath.value = storePath.value.substring(1);
  }
  await browser.storage.sync.set({ storePath: storePath.value });
  const vaultServer = document.getElementById('serverBox');
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  console.log('TokenGrabber: Target Tab', currentTab);

  if (!currentTab) {
    notify.error('No active tab found.');
    return;
  }

  // Check if we are trying to grab token from the options page itself
  if (
    currentTab.url &&
    (currentTab.url.startsWith('moz-extension://') ||
      currentTab.url.startsWith('chrome-extension://'))
  ) {
    notify
      .clear()
      .error(
        'You are on the Options page. Please go to the Vault tab, click the extension icon, click "Options", and then click "Get Token".'
      );
    return;
  }

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
      console.error('TokenGrabber Error:', err);
      notify.clear().error(`Error contacting Vault tab: ${err.message}`);
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
