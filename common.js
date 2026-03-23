/* eslint-disable no-unused-vars */
/* global chrome */

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

if (!browser.browserAction) {
  browser.browserAction = chrome.browserAction ?? chrome.action;
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
