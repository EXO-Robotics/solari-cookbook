import { useEffect, useState } from 'react';
import { z } from 'zod';
import { request } from './api.js';

const Status = z.object({
  armed: z.boolean(),
  expiresAt: z.number().nullable(),
  recoveryReady: z.boolean(),
  reason: z.string(),
  releaseRequestId: z.string().nullable(),
  lastExtensionAck: z
    .object({ requestId: z.string(), rulesRemoved: z.boolean(), at: z.number() })
    .nullable(),
});
export function ProtectionControls({
  token,
  runId,
  canArm,
}: {
  token: string;
  runId?: string;
  canArm: boolean;
}) {
  const [status, setStatus] = useState<z.infer<typeof Status> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = Status.parse(await request('/api/protection', token));
        if (!stopped) setStatus(value);
      } catch {
        if (!stopped) setStatus(null);
      }
      if (!stopped) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token]);
  async function change(action: 'arm' | 'disarm') {
    try {
      setError('');
      setStatus(
        Status.parse(
          await request(
            `/api/protection/${action}`,
            token,
            action === 'arm' ? { runId, durationMs: 120000 } : {},
          ),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Protection command failed.');
    }
  }
  useEffect(() => {
    let zeros = 0;
    let last = 0;
    const key = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;
      const now = performance.now();
      zeros =
        event.key === '0' && !event.metaKey && !event.ctrlKey && !event.altKey
          ? now - last < 2000
            ? zeros + 1
            : 1
          : 0;
      last = now;
      if (zeros === 4) {
        zeros = 0;
        void change('disarm');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [token]);
  return (
    <section className="protection-controls" aria-label="Temporary link protection">
      <div>
        <strong>
          {!status
            ? 'Protection status unavailable'
            : status.armed
              ? 'Registered-link protection lease armed'
              : 'Controller protection lease off'}
        </strong>
        <p>
          {status?.armed
            ? 'Type 0000 to request release. The controller lease lasts up to two minutes.'
            : status?.recoveryReady
              ? 'Keyboard recovery is ready. Authorize a case, then arm for your test.'
              : 'Arming requires the local keyboard recovery helper. Normal Mac use remains available.'}
        </p>
        {status && !status.armed && status.releaseRequestId ? (
          <p>
            {status.lastExtensionAck?.rulesRemoved &&
            status.lastExtensionAck.requestId === status.releaseRequestId
              ? 'Safari reported the test rules removed.'
              : 'Safari rule removal has not been confirmed. The controller lease is off.'}
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
      <button
        className="secondary"
        disabled={!status?.recoveryReady || status.armed || !canArm}
        onClick={() => void change('arm')}
      >
        Arm for 2 minutes
      </button>
      <button className="secondary" onClick={() => void change('disarm')}>
        Release protection
      </button>
    </section>
  );
}
