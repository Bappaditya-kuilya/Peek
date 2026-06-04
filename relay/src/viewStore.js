const { createInMemoryViewStore, MAX_VIEWS } = require('./stores/inMemoryViewStore');

let activeViewStore = createInMemoryViewStore();

function getViewStore() {
  return activeViewStore;
}

function setViewStore(store) {
  activeViewStore = store;
}

module.exports = {
  MAX_VIEWS,
  getViewStore,
  setViewStore,
  createView: (...args) => activeViewStore.createView(...args),
  deleteView: (...args) => activeViewStore.deleteView(...args),
  getView: (...args) => activeViewStore.getView(...args),
  validateUploadToken: (...args) => activeViewStore.validateUploadToken(...args),
};
