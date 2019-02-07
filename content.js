/* global browser */
// We can only access the TABs DOM with this script.
// It will get the credentials via message passing from the popup
// It is also responsible to copy strings to the clipboard

browser.runtime.onMessage.addListener(request => {
  if (request.message === 'copy_to_clipboard') {
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
  else if (request.message === 'fill_creds') {
    var inputs = document.getElementsByTagName('input');
    var passwordNode, usernameNode;
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].type === 'password') {
        passwordNode = inputs[i];
        break;
      }
    }
    if (passwordNode === null) {
      // Could not find passwordNode
      return;
    }

    // Find the username field next to the password field
    for (let testNode = passwordNode.previousSibling; testNode !== null; testNode = testNode.previousSibling) {
      if (testNode && testNode.tagName && testNode.tagName === 'INPUT') {
        usernameNode = testNode;
        break;
      }
    }

    // Go upwards until we find the form node - then check all input nodes
    if (usernameNode !== null) {
      for (let form = passwordNode.parentElement; form !== null; form = form.parentElement) {
        if (form && form.tagName && form.tagName === 'FORM') {
          let inputElements = form.getElementsByTagName('input');
          for (let i = 0; i < inputElements.length; i++) {
            if (inputElements[i].type === 'text' || inputElements[i].type === 'email') {
              usernameNode = inputElements[i];
              break;
            }
          }
          break;
        }
      }
    }

    // Go completely crazy and wild guess any visible input field for the username
    // https://stackoverflow.com/a/21696585
    if (usernameNode !== null) {
      let inputElements = document.getElementsByTagName('input');
      for (let i = 0; i < inputElements.length; i++) {
        if (inputElements[i].offsetParent && (inputElements[i].type === 'text' || inputElements[i].type === 'email')) {
          usernameNode = inputElements[i];
          break;
        }
      }
    }

    if (usernameNode !== null) {
      usernameNode.value = request.username;
      passwordNode.value = request.password;
    }
  }
}
);
