export async function shareUrl({ url, title = 'Peek file transfer session', text = 'Join my Peek file transfer session' }) {
  if (!navigator.canShare || !navigator.share) {
    return { success: false, method: 'clipboard' };
  }

  const shareData = { title, text, url };
  if (!navigator.canShare(shareData)) {
    return { success: false, method: 'clipboard' };
  }

  try {
    await navigator.share(shareData);
    return { success: true, method: 'native' };
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'NotAllowedError') {
      return { success: false, method: 'clipboard' };
    }
    return { success: false, method: 'clipboard' };
  }
}