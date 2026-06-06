function createInMemoryRelayBus() {
  let messageHandler = null;

  return {
    async claimRole() {
      return null;
    },
    getInstanceId() {
      return 'local';
    },
    async getRoleOwner() {
      return null;
    },
    async releaseRole() {
      return false;
    },
    async sendToInstance() {
      return false;
    },
    setMessageHandler(handler) {
      messageHandler = handler;
      return messageHandler;
    },
  };
}

let activeRelayBus = createInMemoryRelayBus();

function getRelayBus() {
  return activeRelayBus;
}

function setRelayBus(bus) {
  activeRelayBus = bus;
}

module.exports = {
  createInMemoryRelayBus,
  getRelayBus,
  setRelayBus,
};
