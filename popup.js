/* eslint-disable no-console */
/* global browser Notify */

const notify = new Notify(document.querySelector('#notify'));
const resultList = document.getElementById('resultList');
const searchInput = document.getElementById('vault-search');
var currentUrl, currentTabId;
var vaultServerAddress, vaultToken, storePath, secretList;

async function mainLoaded() {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
    const tab = tabs[tabIndex];
    if (tab.url) {
      currentTabId = tab.id;
      currentUrl = tab.url;
      break;
    }
  }

  if (searchInput.value.length !== 0) {
    currentUrl = searchInput.value;
  }

  vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
  if (!vaultToken || vaultToken.length === 0) {
    return notify.clear().info(
      `No Vault-Token information available.<br>
      Please use the <a href="/options.html" class="link">options page</a> to login.`,
      { removeOption: false }
    );
  }

  vaultServerAddress = (await browser.storage.sync.get('vaultAddress'))
    .vaultAddress;

  storePath = (await browser.storage.sync.get('storePath'))
    .storePath;

  secretList = (await browser.storage.sync.get('secrets')).secrets;
  if (!secretList) {
    secretList = [];
  }
  querySecrets(searchRegex, (searchInput.value.length != 0));
}

async function querySecrets(searchString, manualSearch) {
  if (searchString.length === 0) {
    searchString = currentUrl;
  }

  resultList.textContent = '';
  const promises = [];
  notify.clear();

  const storeComponents = storePathComponents(storePath);
  let matches = 0;

  for (const secret of secretList) {
    promises.push(
      (async function () {
        const secretsInPath = await fetch(
            `${vaultServerAddress}/v1/${storeComponents.root}/metadata/${storeComponents.subPath}/${secret}`,
            {
              method: 'LIST',
              headers: {
                'X-Vault-Token': vaultToken,
                'Content-Type': 'application/json',
              },
            }
        );
        if (!secretsInPath.ok) {
          if (secretsInPath.status !== 404) {
            notify.error(`Token is not able to read ${secret}... Try re-login`, {
              removeOption: true,
            });
          }
          return;
        }
        for (const element of (await secretsInPath.json()).data.keys) {
          const pattern = new RegExp(element);
          const patternMatches = (pattern.test(searchString) || element.includes(searchString));
          if (patternMatches) {
            const urlPath = `${vaultServerAddress}/v1/${storeComponents.root}/data/${storeComponents.subPath}/${secret}${element}`;
            const credentials = await getCredentials(urlPath);
            const credentialsSets = extractCredentialsSets(credentials.data.data);

            for (const item of credentialsSets) {
              addCredentialsToList(item, element, resultList);

              matches++;
            }
            
            notify.clear();
          }
        }
      })()
    );
  }

  try {
    await Promise.all(promises);

    if (matches > 0) {
      chrome.action.setBadgeText({ text: `${matches}`, tabId: currentTabId });
    } else {
      chrome.action.setBadgeText({ text: ``, tabId: currentTabId });
      notify.info('No matching key found for this page.', {
        removeOption: false,
      });
    }
  } catch (err) {
    chrome.action.setBadgeText({ text: ``, tabId: currentTabId });
    notify.clear().error(err.message);
  }
}

const searchHandler = function (e) {
  if (e.key === 'Enter') {
    mainLoaded()
  }
};

searchInput.addEventListener('keyup', searchHandler);

function extractCredentialsSets(data) {
  const keys = Object.keys(data);
  const credentials = [];

  for (const key of keys) {
    if (key.startsWith('username')) {
      const passwordField = 'password' + key.substring(8);
      if (data[passwordField]) {
        credentials.push(
        { 
          username: data[key],
          password: data['password' + key.substring(8)]
        });
      }
    }
  }

  return credentials;
}

function addCredentialsToList(credentials, credentialName, list) {
  const item = document.createElement('li');
  item.classList.add('list__item', 'list__item--three-line');

  const primaryContent = document.createElement('button');
  primaryContent.title = 'insert credentials';
  primaryContent.classList.add(
    'list__item-primary-content',
    'list__item-button',
    'nobutton',
    'js-button',
    'js-ripple-effect'
  );
  primaryContent.addEventListener('click', function () {
    fillCredentialsInBrowser(credentials.username, credentials.password);
  });
  item.appendChild(primaryContent);

  const titleContent = document.createElement('span');
  titleContent.classList.add('list__item-text-title', 'link');
  titleContent.textContent = credentials.title || credentialName;
  primaryContent.appendChild(titleContent);

  const detailContent = document.createElement('span');
  detailContent.classList.add('list__item-text-body');
  detailContent.textContent = `User: ${credentials.username}`;
  primaryContent.appendChild(detailContent);

  const actions = document.createElement('div');
  actions.classList.add('list__item-actions');
  item.appendChild(actions);

  const copyUsernameButton = document.createElement('button');
  copyUsernameButton.classList.add('button');
  copyUsernameButton.title = 'copy username to clipboard';
  copyUsernameButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon--inline">
      <use href="icons/copy-user.svg#copy-user"/>
    </svg>
  `;
  copyUsernameButton.addEventListener('click', function () {
    copyStringToClipboard(credentials.username);
  });
  actions.appendChild(copyUsernameButton);

  const copyPasswordButton = document.createElement('button');
  copyPasswordButton.classList.add('button');
  copyPasswordButton.title = 'copy password to clipboard';
  copyPasswordButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon--inline">
      <use href="icons/copy-key.svg#copy-key"/>
    </svg>
  `;
  copyPasswordButton.addEventListener('click', function () {
    copyStringToClipboard(credentials.password);
  });
  actions.appendChild(copyPasswordButton);

  list.appendChild(item);
}

async function getCredentials(urlPath) {
  const vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
  const result = await fetch(urlPath, {
    headers: {
      'X-Vault-Token': vaultToken,
      'Content-Type': 'application/json',
    },
  });
  if (!result.ok) {
    throw new Error(`getCredentials: ${await result.text}`);
  }
  return await result.json();
}

async function fillCredentialsInBrowser(username, password) {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
    const tab = tabs[tabIndex];
    if (tab.url) {
      // tabs.sendMessage(integer tabId, any message, optional object options, optional function responseCallback)

      browser.tabs.sendMessage(tab.id, {
        message: 'fill_creds',
        username: username,
        password: password,
      });
      break;
    }
  }
}

async function copyStringToClipboard(string) {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
    const tab = tabs[tabIndex];
    if (tab.url) {
      browser.tabs.sendMessage(tab.id, {
        message: 'copy_to_clipboard',
        string: string,
      });
      break;
    }
  }
}

document.addEventListener('DOMContentLoaded', mainLoaded, false);
