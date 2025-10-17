/* global Notify storePathComponents */

const notify = new Notify(document.querySelector('#notify'));
const addKeyForm = document.getElementById('addKeyForm');
const cancelButton = document.getElementById('cancelButton');
const secretPathSelect = document.getElementById('secretPath');

async function mainLoaded() {
  // Load available secret paths
  await loadSecretPaths();

  // Set up event listeners
  addKeyForm.addEventListener('submit', handleFormSubmit);
  cancelButton.addEventListener('click', handleCancel);
}

async function loadSecretPaths() {
  try {
    const secrets = (await browser.storage.sync.get('secrets')).secrets;

    if (!secrets || secrets.length === 0) {
      notify.error(
        'No secret paths configured. Please go to Options and configure at least one secret path first.'
      );
      return;
    }

    // Populate the dropdown
    secrets.forEach((secret) => {
      const option = document.createElement('option');
      option.value = secret;
      option.textContent = secret;
      secretPathSelect.appendChild(option);
    });

    // If there's only one path, auto-select it
    if (secrets.length === 1) {
      secretPathSelect.value = secrets[0];
    }
  } catch (err) {
    notify.error(`Error loading secret paths: ${err.message}`);
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();

  // Clear any existing messages
  notify.clear();

  // Scroll to top to show messages
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const secretPath = document.getElementById('secretPath').value.trim();
  const urlRegex = document.getElementById('urlRegex').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const title = document.getElementById('title').value.trim();

  // Validate inputs
  if (!secretPath) {
    notify.error('Please select a secret path.');
    return;
  }

  if (!urlRegex || !username || !password) {
    notify.error('URL pattern, username, and password are required.');
    return;
  }

  // Check if URL pattern starts with http:// or https://
  if (urlRegex.startsWith('http://') || urlRegex.startsWith('https://')) {
    notify.error(
      'URL pattern cannot start with http:// or https://. Please use a regex pattern instead (e.g., ^https://example\\.com.*).'
    );
    return;
  }

  // Validate regex pattern
  try {
    new RegExp(urlRegex);
  } catch {
    notify.error('Invalid URL regex pattern. Please check your pattern.');
    return;
  }

  // Double-encode the URL regex to use as the key name in Vault
  // First encoding: a/b -> a%2Fb
  // Second encoding: a%2Fb -> a%252Fb
  // Vault will decode once: a%252Fb -> a%2Fb (stored in Vault)
  const encodedKeyName = encodeURIComponent(encodeURIComponent(urlRegex));

  try {
    // Get Vault credentials
    const vaultToken = (await browser.storage.local.get('vaultToken'))
      .vaultToken;
    const vaultServerAddress = (await browser.storage.sync.get('vaultAddress'))
      .vaultAddress;
    const storePath = (await browser.storage.sync.get('storePath')).storePath;

    if (!vaultToken || !vaultServerAddress) {
      notify.error(
        'Not authenticated with Vault. Please go to Options and login first.'
      );
      return;
    }

    const storeComponents = storePathComponents(storePath);

    // Create the data object to save
    const keyData = {
      username: username,
      password: password,
    };

    if (title) {
      keyData.title = title;
    }

    // Save to Vault using the encoded key name
    // The key name is already encoded earlier in the function
    const vaultUrl = `${vaultServerAddress}/v1/${storeComponents.root}/data/${storeComponents.subPath}/${secretPath}${encodedKeyName}`;

    const response = await fetch(vaultUrl, {
      method: 'POST',
      headers: {
        'X-Vault-Token': vaultToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: keyData }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save to Vault: ${errorText}`);
    }

    notify.success('Key saved successfully to Vault!', { time: 2000 });

    // Clear form
    addKeyForm.reset();

    // Redirect back to popup after a short delay
    setTimeout(() => {
      window.location.href = '/popup.html';
    }, 1500);
  } catch (err) {
    notify.error(`Error saving key: ${err.message}`);
  }
}

function handleCancel() {
  window.location.href = '/popup.html';
}

document.addEventListener('DOMContentLoaded', mainLoaded, false);
