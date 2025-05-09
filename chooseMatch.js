/* eslint-disable no-console */
/* global chrome */

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'popup_matches') {
    populateMatches(event.data.matches);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closePopupBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.close();
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'close_popup' }, '*');
      }
    });
  }
});

function populateMatches(matches) {
  const matchesListEl = document.getElementById('matchesList');
  if (!matchesListEl) {
    console.error("Element with ID 'matchesList' not found.");
    return;
  }
  matchesListEl.innerHTML = '';

  matches.forEach((match) => {
    const li = document.createElement('li');
    li.classList.add('list__item', 'list__item--three-line');

    const btn = document.createElement('button');
    btn.title = 'Insert credentials';
    btn.classList.add(
      'list__item-primary-content',
      'list__item-button',
      'nobutton',
      'js-button',
      'js-ripple-effect'
    );

    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        message: 'fill_creds',
        username: match.username,
        password: match.password,
        isUserTriggered: true,
      });
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'close_popup' }, '*');
      }
    });

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('list__item-text-title', 'link');
    titleSpan.textContent = match.organization + match.secret;
    if (match.comment && match.comment.length > 0) {
      titleSpan.title = match.comment;
    }
    btn.appendChild(titleSpan);

    const detailSpan = document.createElement('span');
    detailSpan.classList.add('list__item-text-body');
    detailSpan.textContent = `User: ${match.username}`;
    btn.appendChild(detailSpan);

    li.appendChild(btn);
    matchesListEl.appendChild(li);
  });
}

function adjustIframeSize() {
  const newHeight = document.documentElement.scrollHeight;
  window.parent.postMessage({ type: 'iframe_resize', height: newHeight }, '*');
}

const observer = new MutationObserver(() => {
  adjustIframeSize();
});
observer.observe(document.body, { childList: true, subtree: true });
