/* eslint-disable no-console */
/* global browser */
// We can only access the TABs DOM with this script.
// It will get the credentials via message passing from the popup
// It is also responsible to copy strings to the clipboard

browser.runtime.onMessage.addListener((request) => {
  switch (request.message) {
    case 'copy_to_clipboard':
      handleCopyToClipboard(request);
      break;
    case 'fill_creds':
      handleFillCredits(request);
      break;
    case 'fetch_token':
      handleFetchToken();
      break;
  }
});

function handleCopyToClipboard(request) {
  const el = document.createElement('textarea');
  el.value = request.string;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  const selected =
    document.getSelection().rangeCount > 0
      ? document.getSelection().getRangeAt(0)
      : false;
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  if (selected) {
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(selected);
  }
}

function findUsernameNodeIn(parentNode, visible) {
  const matches = [
    '[autocomplete="email"]',
    '[autocomplete="username"]',
    '[autocomplete="nickname"]',
    '[type="email"]',
    '[name="user_name"]',
    '[name="auth[username]"]',
    '[type="text"][name="email"]',
    '[type="text"][name="mail"]',
    '[type="text"][name="nickname"]',
    '[type="text"][name="nick"]',
    '[type="text"][name="username"]',
    '[type="text"][name="login"]',
    '[type="text"]',
  ];

  for (let selector of matches) {
    const usernameNode = parentNode.querySelector(selector);
    if (usernameNode && (visible ? usernameNode.offsetParent : true)) {
      return usernameNode;
    }
  }

  return null;
}

function createEvent(name) {
  const event = document.createEvent('Events');
  event.initEvent(name, true, true);
  return event;
}

function fillIn(node, value) {
  node.focus();
  node.value = value;
  node.dispatchEvent(createEvent('input'));
  node.dispatchEvent(createEvent('change'));
  node.blur();
}

function handleFillCredits(request) {
  // eslint-disable-next-line quotes
  const passwordNode = document.querySelector("input[type='password']");
  if (!passwordNode) return;

  const formNode = passwordNode.closest('form');
  // Go completely crazy and wild guess any visible input field for the username if empty formNode
  // https://stackoverflow.com/a/21696585
  const usernameNode = formNode
    ? findUsernameNodeIn(formNode)
    : findUsernameNodeIn(document, true);
  if (!usernameNode) return;

  fillIn(usernameNode, request.username);
  fillIn(passwordNode, request.password);
}

function handleFetchToken() {
  let element = '';
  for (const [, value] of Object.entries(window.localStorage)) {
    try {
      element = JSON.parse(value);
    } catch {
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(element,'token') &&
      Object.prototype.hasOwnProperty.call(element,'ttl') &&
      Object.prototype.hasOwnProperty.call(element,'policies')
    ) {
      browser.runtime.sendMessage({
        type: 'fetch_token',
        token: element.token,
        policies: element.policies,
        address: window.location.origin,
      });
      return;
    }
  }
  browser.runtime.sendMessage({
    type: 'token_missing',
    token: element.token,
    policies: element.policies,
    address: window.location.origin,
  });
}

function fillForm() {
  browser.runtime.sendMessage({
    type: 'auto_fill_secrets',
  });
}

fillForm();
