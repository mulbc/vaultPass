/* eslint-disable no-console */
/* eslint-disable no-prototype-builtins */
/* global browser Notify storePathComponents */

const notify = new Notify(document.querySelector('#notify'));
const resultList = document.getElementById('resultList');
const searchInput = document.getElementById('vault-search');
var currentUrl, currentTabId;
var vaultServerAddress, vaultToken;

async function mainLoaded() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
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

  vaultServerAddress = (await browser.storage.sync.get('vaultAddress')).vaultAddress;

  await querySecrets(currentUrl, searchInput.value.length !== 0);
}

async function querySecrets(searchString, manualSearch) {
  if (searchString.length === 0) {
    searchString = currentUrl;
  }

  resultList.textContent = '';
  const promises = [];
  notify.clear();

  let matches = 0;

  let secretList = (await browser.storage.sync.get('secrets')).secrets || [];
  for (const secret of secretList) {
    promises.push(querySecretsCallback(searchString, secret,
        function(element, credentialsSets) {
          for (const item of credentialsSets) {
            addCredentialsToList(item, element, resultList);
            matches++;
          }
        }
      )
    );
  }

  try {
    await Promise.all(promises);

    if (matches > 0) {
      browser.browserAction.setBadgeText({
        text: `${matches}`,
        tabId: currentTabId,
      });
    } else {
      browser.browserAction.setBadgeText({ text: '', tabId: currentTabId });
      if (!manualSearch) {
        notify.info('No matching key found for this page.', {
          removeOption: false,
        });
      } else {
        notify.info('No matching key found for the search', {
          removeOption: false,
        });
      }
    }
  } catch (err) {
    browser.browserAction.setBadgeText({ text: '', tabId: currentTabId });
    notify.clear().error(err.message);
  }
}

const searchHandler = function (e) {
  if (e.key === 'Enter') {
    mainLoaded();
  }
};

searchInput.addEventListener('keyup', searchHandler);

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
  if (credentials.comment && credentials.comment.length > 0) {
    titleContent.title = credentials.comment;
  }
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

async function fillCredentialsInBrowser(username, password) {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
    const tab = tabs[tabIndex];
    if (tab.url) {
      // tabs.sendMessage(integer tabId, any message, optional object options, optional function responseCallback)

      browser.tabs.sendMessage(tab.id, {
        message: 'fill_creds',
        username: username,
        password: password,
        isUserTriggered: true,
      });
      break;
    }
  }
}

async function copyStringToClipboard(string) {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
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
