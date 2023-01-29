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

function findUsernameNodeIn(
  parentNode,
  checkVisibility,
  isUserTriggered = false
) {
  const matches = [
    '[autocomplete="email"]',
    '[autocomplete="username"]',
    '[autocomplete="nickname"]',
    'input[id="username"]',
    'input[id="userid"]',
    'input[id="login"]',
    'input[id="email"]',
    'textarea[id="username"]',
    'textarea[id="userid"]',
    'textarea[id="login"]',
    'textarea[id="email"]',
    '[type="email"]',
    '[name="user_name"]',
    '[name="user"]',
    '[name="auth[username]"]',
    '[type="text"][name="username"]',
    '[type="text"][name="userid"]',
    '[type="text"][name="login"]',
    '[type="text"][name="email"]',
    '[type="text"][name="mail"]',
    '[type="text"][name="nickname"]',
    '[type="text"][name="nick"]',
  ];

  if (parentNode instanceof HTMLFormElement || isUserTriggered) {
    matches.push('[type="text"]');
  }

  for (const selector of matches) {
    const allUsernameNodes = parentNode.querySelectorAll(selector);

    let usernameNode = null;
    for (const node of allUsernameNodes) {
      if (checkVisibility ? isVisible(node) : true) {
        usernameNode = node;
        break;
      }
    }
    if (usernameNode) {
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

function isVisible(node) {
  if (!node.offsetParent) {
    return false;
  }

  if (node.style.display === 'none') {
    return false;
  }

  if (node.style.visibility === 'hidden') {
    return false;
  }

  const computedStyle = window.getComputedStyle(node);
  const visibility = computedStyle.getPropertyValue('visibility');

  return visibility !== 'hidden';
}

function findPasswordInput() {
  // eslint-disable-next-line quotes
  const passwordNodes = document.querySelectorAll("input[type='password']");
  for (const node of passwordNodes) {
    if (isVisible(node)) return node;
  }

  return passwordNodes.length > 0 ? passwordNodes[0] : null;
}

function handleFillCredits(request) {
  const passwordNode = findPasswordInput();
  // A number of websites now prompt for the password separately
  if (passwordNode) {
    fillIn(passwordNode, request.password);
  }

  const formNode = passwordNode?.closest('form');
  // Go completely crazy and wild guess any visible input field for the username if empty formNode
  // https://stackoverflow.com/a/21696585
  const usernameNode = formNode
    ? findUsernameNodeIn(formNode, true)
    : findUsernameNodeIn(document, true, request.isUserTriggered);
  if (!usernameNode) return;

  fillIn(usernameNode, request.username);
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
      Object.prototype.hasOwnProperty.call(element, 'token') &&
      Object.prototype.hasOwnProperty.call(element, 'ttl') &&
      Object.prototype.hasOwnProperty.call(element, 'policies')
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
