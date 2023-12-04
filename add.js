/* eslint-disable no-console */
/* global browser Notify storePathComponents */

const notify = new Notify(document.querySelector('#notify'));

async function mainLoaded() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true
    });
    for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
        const tab = tabs[tabIndex];
        if (tab.url) {
            currentTabId = tab.id;
            currentUrl = tab.url;
            break;
        }
    }

    document.getElementById('addButton').addEventListener('click', addButtonClick, false);
    document.getElementById('showPasswordButton').addEventListener('click', showPasswordClick, false);

    const vaultServer = document.getElementById('urlBox');
    vaultServer.value = new URL(currentUrl).host;

    try {
        await populateDirectorySelection();
    } catch (err) {
        notify.clear().error(err.message);
        return;
    }

    let first = 1;
    let secretList = (await browser.storage.sync.get('secrets')).secrets || [];
    if (secretList) {
        try {
            await querySecretsCallback(currentUrl, secretList[0], function(element, credentialsSets) {
                if (credentialsSets) {
                    const c = credentialsSets[0];
                    document.getElementById('urlBox').value = element;
                }
            });
        } catch (err) {
            notify.clear().error(err.message);
            return
        }
    }
}

async function populateDirectorySelection(vaultServerAddress, vaultToken,
    policies, storePath) {
    const fetchListOfSecretDirs =
        await vaultApiCall('LIST', 'metadata', '', 'Fetching secrets directories');

    let activeSecrets = (await browser.storage.sync.get('secrets')).secrets;
    if (!activeSecrets) {
        activeSecrets = [];
    }

    const availableSecrets = (await fetchListOfSecretDirs.json()).data.keys;
    activeSecrets =
        activeSecrets.filter((x) => availableSecrets.indexOf(x) !== -1);

    const dirsList = document.getElementById('dirsList');
    var first = 1;
    for (const secret of activeSecrets) {
        var option = document.createElement('option');
        option.value = secret;
        if (first) {
            first = 0;
            option.selected = true;
            const dirBox = document.getElementById('dirBox')
            dirBox.placeholder = secret;
            dirBox.value = secret;
        }
        dirsList.appendChild(option);
    }
}

async function addButtonClick() {
    const dirBox = document.getElementById('dirBox').value;
    const urlBox = document.getElementById('urlBox').value;
    const loginBox = document.getElementById('loginBox').value;
    const passBox = document.getElementById('passBox').value;
    // verify input not empty. TODO: verify correct URL format.
    if (urlBox.includes("/")) {
        notify.error("Bad input, url has slash")
        return
    }
    if (dirBox.length == 0 || urlBox.length == 0 || loginBox.length == 0 ||
        passBox.length == 0) {
        notify.error("Bad input, field is empty")
        return
    }
    // get current value if exists
    const passpath = dirBox + urlBox;
    const resp = await vaultApiCall("GET", 'data', passpath, '')
    const respjson = resp.ok ? await resp.json() : {};
    const data = resp.ok ? respjson.data : {};
    const cas = resp.ok ? respjson.data.metadata.version : 0;
    const cur = resp.ok ? respjson.data.data : {};
    const userkey = `username-vaultpass-${loginBox}`;
    cur[userkey] = loginBox;
    cur[`password-vaultpass-${passBox}`] = passBox;
    const postdata = {
        'data': cur,
        'options': {
            'cas': cas,
        },
    };
    const postdatajson = JSON.stringify(postdata);
    //notify.error(`cur=${cur} cas=${cas} data=${postdatajson}`);
    const resp2 =
        await vaultApiCall("POST", 'data', passpath,
            `could not update value with ${postdatajson}`, postdata);

    document.getElementById('loginBox').value = "";
    document.getElementById('passBox').value = "";
    notify.success(`Added entry ${userkey} to ${passpath}`);
}

function showPasswordClick() {
    var x = document.getElementById("passBox");
    if (x.type === "password") {
        x.type = "text";
    } else {
        x.type = "password";
    }
}

document.addEventListener('DOMContentLoaded', mainLoaded, false);
