/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
/* global browser chrome */

function storePathComponents(storePath) {
  const path = storePath && storePath.length > 0 ? storePath : 'secret/vaultPass';
  const pathComponents = path.split('/');
  const storeRoot = pathComponents[0];
  const storeSubPath = pathComponents.length > 0 ? pathComponents.slice(1).join('/') : '';
  return {
    root: storeRoot,
    subPath: storeSubPath ? '/' + storeSubPath : '',
  };
}

/**
 * Make a call to vault api.
 * @param string method GET or POST or LIST etc.
 * @param midpath The middle of the vault path. Basically "metadata" or "data".
 * @param path The suffix of the path to query from vault.
 * @param string error if set, will error this if not ok.
 * @param dict body if set, will add it to POST it
 */
async function vaultApiCall(method, midpath, path = "", error = "", body = undefined) {
    const vaultToken = (await browser.storage.local.get('vaultToken')).vaultToken;
    const vaultServerAddress = (await browser.storage.sync.get('vaultAddress')).vaultAddress;
    const storePath = (await browser.storage.sync.get('storePath')).storePath;
    const storeComponents = storePathComponents(storePath);
    if (path) {
        // make sure path has leading slash.
        path = "/" + path.replace(/^\/*/, "");
    }
    const url = `${vaultServerAddress}/v1/${storeComponents.root}/${midpath}${storeComponents.subPath}${path}`;
    const res = await fetch(url, {
        method: method,
        headers: {
            'X-Vault-Token': vaultToken,
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (error && (!res.ok || res.status != 200)) {
        const apiResponse = await res.json();
        const msg = `ERROR: ${error}. Calling ${url} failed with status=${
            res.status}. ${apiResponse.errors.join('. ')}`
        notify.error(msg);
        throw msg;
    }
    return res;
}

/**
 * From data returned from vault in data extract the credentials.
 */
function extractCredentialsSets(data) {
  const keys = Object.keys(data);
  const credentials = [];
  for (const key of keys) {
    if (key.startsWith('username')) {
      const suffix = key.substring(8);
      const passwordField = 'password' + suffix;
      if (data[passwordField]) {
        credentials.push({
          username: data[key],
          password: data['password' + suffix],
          title: data.hasOwnProperty('title' + suffix)
            ? data['title' + suffix]
            : data.hasOwnProperty('title')
              ? data['title']
              : '',
          comment: data.hasOwnProperty('comment' + suffix)
            ? data['comment' + suffix]
            : data.hasOwnProperty('comment')
              ? data['comment']
              : '',
        });
      }
    }
  }
  return credentials;
}

/**
 * small wrapper around vault api call to get the secrets stored in kv in vault at urlpath
 */
async function getCredentials(urlPath) {
  const result = await vaultApiCall("GET", "data", urlPath, "getting credentials")
  return await result.json();
}

/**
 * makes a query to get all secrets
 * @param string searchString The saerched string, most probably URL.
 * @param string secret
 * @param function(string, credentials[]) callback Callback to call with the url and credentials.
 */
async function querySecretsCallback(searchString, secret, callback) {
  const secretsInPath = await vaultApiCall("LIST", "metadata", `${secret}`)
  if (!secretsInPath.ok) {
    if (secretsInPath.status !== 404) {
      notify.error(`Unable to read ${secret}... Try re-login`, {
        removeOption: true,
      });
    }
    return;
  }
  for (const element of (await secretsInPath.json()).data.keys) {
    const pattern = new RegExp(element);
    const patternMatches = pattern.test(searchString) || element.includes(searchString);
    if (patternMatches) {
      const credentials = await getCredentials(`${secret}${element}`);
      const credentialsSets = extractCredentialsSets(credentials.data.data);
      callback(element, credentialsSets);
      notify.clear();
    }
  }
}

if (!browser.browserAction) {
  browser.browserAction = chrome.browserAction ?? chrome.action;
}
