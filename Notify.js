class Notify {
  constructor(node) {
    this.node = node;
    this.messages = [];
  }

  error(message, options) {
    return this.message({ level: 'error', message, ...options });
  }

  success(message, options) {
    return this.message({ level: 'success', message, ...options });
  }

  info(message, options) {
    return this.message({ level: 'info', message, ...options });
  }

  message({ level = 'info', message, time, removeOption = true }) {
    const messageNode = document.createElement('div');
    messageNode.classList.add('notify', `notify--${level}`);
    messageNode.innerHTML = message;

    this._append(messageNode);

    if (removeOption) this._addRemoveOption(messageNode);
    if (time) setTimeout(() => messageNode.remove(), time);
    return this;
  }

  clear() {
    this.node.innerHTML = '';
    this.messages = [];
    return this;
  }

  _addRemoveOption(node) {
    const removeNode = document.createElement('button');
    removeNode.innerHTML = '✖';
    removeNode.classList.add('nobutton', 'link', 'notify__button');
    removeNode.addEventListener('click', () => node.remove());
    node.append(removeNode);
  }

  _append(node) {
    this.messages.push(node);
    this.node.append(node);
  }
}
