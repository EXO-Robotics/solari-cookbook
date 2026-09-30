/* global browser */
document.getElementById('pair').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('token');
  const status = document.getElementById('status');
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(input.value)) {
    status.textContent = 'Enter a valid local pairing token.';
    return;
  }
  try {
    await browser.storage.local.set({ entryToken: input.value });
    input.value = '';
    status.textContent =
      'Pairing saved. Authorize an attempt and arm a short protection lease in AionGuard before a protected navigation.';
  } catch {
    status.textContent = 'Pairing could not be saved.';
  }
});

// Import directly into extension storage without rendering a credential in the DOM.
document.getElementById('token-file').addEventListener('change', async (event) => {
  const status = document.getElementById('status');
  const file = event.target.files?.[0];
  try {
    if (!file || file.size > 512) throw new Error('INVALID_TOKEN_FILE');
    const token = (await file.text()).trim();
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('INVALID_TOKEN_FILE');
    await browser.storage.local.set({ entryToken: token });
    status.textContent =
      'Pairing saved from the local file. Authorize an attempt and arm protection in AionGuard.';
  } catch {
    status.textContent = 'Choose the local entry-token file created by AionGuard.';
  } finally {
    event.target.value = '';
  }
});
