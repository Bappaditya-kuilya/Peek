const STORAGE_KEY = 'peek:pairedDevices';

function getStored() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setStored(devices) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

export function getPairedDevices() {
  return getStored().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

export function addPairedDevice(deviceId, name) {
  const devices = getStored();
  if (devices.some(d => d.deviceId === deviceId)) {
    return devices.find(d => d.deviceId === deviceId);
  }
  const device = { deviceId, name, pairedAt: Date.now(), lastUsed: Date.now() };
  setStored([...devices, device]);
  return device;
}

export function renamePairedDevice(deviceId, name) {
  const devices = getStored().map(d => d.deviceId === deviceId ? { ...d, name } : d);
  setStored(devices);
}

export function forgetPairedDevice(deviceId) {
  const devices = getStored().filter(d => d.deviceId !== deviceId);
  setStored(devices);
}

export function updateLastUsed(deviceId) {
  const devices = getStored().map(d => d.deviceId === deviceId ? { ...d, lastUsed: Date.now() } : d);
  setStored(devices);
}

export function clearPairedDevices() {
  localStorage.removeItem(STORAGE_KEY);
}