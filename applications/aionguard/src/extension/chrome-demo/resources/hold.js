const requestId = crypto.randomUUID();
const status = document.querySelector('#status');
const heading = document.querySelector('#heading');
const receipt = document.querySelector('#receipt');
document.body.dataset.requestId = requestId;

function failed() {
  document.body.dataset.state = 'ERROR';
  status.textContent = 'Inspection unavailable. Navigation remains held.';
}

async function check() {
  try {
    const started = await chrome.runtime.sendMessage({ type: 'INSPECT', requestId });
    if (!started?.ok) return failed();
    document.body.dataset.runId = started.runId;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const result = await chrome.runtime.sendMessage({ type: 'STATUS', requestId });
      if (!result?.ok) return failed();
      if (result.state === 'COMPLETE') {
        document.body.dataset.decision = result.decision;
        if (result.decision === 'RELEASE') {
          heading.textContent = 'No warning signs detected. Opening…';
          status.textContent =
            'The check completed without findings. Opening the destination in this browser.';
          document.body.dataset.state = 'RELEASING';
          const released = await chrome.runtime.sendMessage({ type: 'RELEASE', requestId });
          if (!released?.ok) failed();
          return;
        }
        const suspicious = result.decision === 'BLOCK';
        heading.textContent = suspicious ? 'Warning signs found.' : 'This check needs review.';
        status.textContent = suspicious
          ? 'The link stays blocked. Solari collected the evidence without opening the destination here.'
          : 'The check could not authorize navigation. Review the evidence or try again.';
        receipt.href = result.receiptUrl;
        receipt.hidden = false;
        document.body.dataset.classification = result.classification;
        document.body.dataset.state = 'COMPLETE';
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    failed();
  } catch {
    failed();
  }
}
void check();
