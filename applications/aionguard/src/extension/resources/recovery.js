/* global browser */
let zeros = 0;
async function emergencyDisarm() {
  const status = document.getElementById('recovery-status');
  if (status) status.textContent = 'Disarming AionGuard protection…';
  try {
    const result = await browser.runtime.sendMessage({ type: 'EMERGENCY_DISARM' });
    if (status)
      status.textContent =
        result?.ok === true
          ? 'AionGuard protection is off. New protection requires an explicit arm action.'
          : 'Disable AionGuard in Safari Settings → Extensions, or quit Safari to clear session rules.';
  } catch {
    if (status)
      status.textContent =
        'Disable AionGuard in Safari Settings → Extensions, or quit Safari to clear session rules.';
  }
}
document.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  zeros = event.key === '0' && !event.ctrlKey && !event.altKey && !event.metaKey ? zeros + 1 : 0;
  if (zeros === 4) {
    zeros = 0;
    void emergencyDisarm();
  }
});
document.getElementById('disarm')?.addEventListener('click', emergencyDisarm);
