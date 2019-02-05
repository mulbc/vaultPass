/* global authButtonClick browser */
async function mainLoaded() {
  // get inputs from form elements, server URL, login and password
  var vaultServer = document.getElementById('serverBox');
  var login = document.getElementById('loginBox');

  var vaultServerAdress = (await browser.storage.sync.get('vaultAddress')).vaultAddress;
  if (vaultServerAdress) {
    vaultServer.value = vaultServerAdress;
    vaultServer.parentNode.classList.add('is-dirty');
  }
  var username = (await browser.storage.sync.get('username')).username;
  if (username) {
    login.value = username;
    login.parentNode.classList.add('is-dirty');
  }
  var vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
  if (vaultToken) {
    querySecrets(vaultServerAdress, vaultToken);
  }

  // put listener on login button
  document.getElementById('authButton').addEventListener('click', authButtonClick, false);
  document.getElementById('logoutButton').addEventListener('click', logout, false);
}

async function querySecrets(vaultServerAdress, vaultToken) {
  // Hide login prompt if we already have a Token
  document.getElementById('login').style.display = 'none';
  document.getElementById('logout').style.display = 'block';
  var notify = document.getElementById('notify');

  var fetchListOfSecretDirs = await fetch(`${vaultServerAdress}/v1/secret/metadata/vaultPass`, {
    method: 'LIST',
    headers: {
      'X-Vault-Token': vaultToken,
      'Content-Type': 'application/json'
    },
  });
  if (!fetchListOfSecretDirs.ok) {
    notify.textContent = `Fetching list of secret directories failed: ${await fetchListOfSecretDirs.text()}`;
    throw new Error(`Fetching list of secret directories failed: ${await fetchListOfSecretDirs.text()}`);
  }
  displaySecrets((await fetchListOfSecretDirs.json()).data.keys);
}

async function logout() {
  document.getElementById('login').style.display = 'block';
  document.getElementById('logout').style.display = 'none';
  document.getElementById('secretList').innerHTML = '';
  document.getElementById('notify').innerHTML = '';
  await browser.storage.local.set({ 'vaultToken': null });
}

async function displaySecrets(secrets) {
  var list = document.getElementById('secretList');
  var activeSecrets = (await browser.storage.sync.get('secrets')).secrets;
  if (!activeSecrets) {
    activeSecrets = [];
  }

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
    secondaryContent.innerText = "Active "
    label.appendChild(secondaryContent);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = 1;
    checkbox.name = secret;
    checkbox.checked = activeSecrets.indexOf(secret) > -1;
    checkbox.addEventListener('change', event => secretChanged({event, checkbox, item}));
    secondaryContent.appendChild(checkbox);

    // Add it to the list:
    list.appendChild(item);
  }

}

async function secretChanged({ checkbox, item }) {
  var activeSecrets = (await browser.storage.sync.get('secrets')).secrets;
  if (!activeSecrets) {
    activeSecrets = [];
  }

  if (checkbox.checked) {
    var vaultServerAdress = (await browser.storage.sync.get('vaultAddress')).vaultAddress;
    var vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
    if (!vaultToken) {
      throw new Error('secretChanged: Vault Token is empty after login');
    }

    var fetchListOfSecretsForDir = await fetch(`${vaultServerAdress}/v1/secret/metadata/vaultPass/${checkbox.name}`, {
      method: 'LIST',
      headers: {
        'X-Vault-Token': vaultToken,
        'Content-Type': 'application/json'
      },
    });
    if (!fetchListOfSecretsForDir.ok) {
      checkbox.checked = false;
      checkbox.disabled = true;
      item.classList.add("disabled");
      throw new Error(`ERROR accessing this field: ${await fetchListOfSecretsForDir.text()}`);
    }
    if (activeSecrets.indexOf(checkbox.name) < 0) {
      activeSecrets.push(checkbox.name);
    }
    await browser.storage.sync.set({ 'secrets': activeSecrets });

  } else {
    for (let index = activeSecrets.indexOf(checkbox.name); index > -1; index = activeSecrets.indexOf(checkbox.name)) {
      activeSecrets.splice(index, 1);
    }
    await browser.storage.sync.set({ 'secrets': activeSecrets });
  }
}

// invoked after user clicks "login to vault" button, if all fields filled in, and URL passed regexp check.
async function authToVault(vaultServer, username, password, authMount) {
  var loginToVault = await fetch(`${vaultServer}/v1/auth/${authMount}/login/${username}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 'password': password }),
  });
  if (!loginToVault.ok) {
    new Error(`authToVault: ${await loginToVault.text}`);
  }
  const token = (await loginToVault.json()).auth.client_token;
  await browser.storage.local.set({ 'vaultToken': token });
  querySecrets(vaultServer, token);
  // TODO: Use user token to generate app token with 20h validity - then use THAT token

}

async function authButtonClick() {
  var notify = document.getElementById('notify');
  // get inputs from form elements, server URL, login and password
  var vaultServer = document.getElementById('serverBox');
  var login = document.getElementById('loginBox');
  var authMount = document.getElementById('authMount');
  var pass = document.getElementById('passBox');
  // verify input not empty. TODO: verify correct URL format.
  if ((vaultServer.value.length > 0) && (login.value.length > 0) && (pass.value.length > 0)) {
    // if input fields are not empty, attempt authorization to specified vault server URL.
    await browser.storage.sync.set({ 'vaultAddress': vaultServer.value });
    await browser.storage.sync.set({ 'username': login.value });
    authToVault(vaultServer.value, login.value, pass.value, authMount.value);
  } else {
    notify.textContent = 'Bad input, must fill in all 3 fields.';
  }
}

document.addEventListener('DOMContentLoaded', mainLoaded, false);
