import { clickTimingCsv, type ClickTimingRecord } from './interaction-timing.js';
import { CaseSnapshotSchema, type CaseSnapshot } from '../contracts/index.js';
export async function request(path: string, token: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      typeof value.error === 'string'
        ? value.error.replaceAll('_', ' ').toLowerCase()
        : 'Request failed',
    );
  return value;
}
export async function caseRequest(
  path: string,
  token: string,
  body?: unknown,
): Promise<CaseSnapshot> {
  return CaseSnapshotSchema.parse(await request(path, token, body));
}
export async function exportReceipt(run: string, token: string): Promise<void> {
  const value = await request(`/api/attempts/${run}/receipt`, token);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `aionguard-${run}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportClickTimings(
  records: readonly ClickTimingRecord[],
  format: 'json' | 'csv',
): void {
  const content =
    format === 'json'
      ? JSON.stringify({ schemaVersion: '1.0.0', records }, null, 2) + '\n'
      : clickTimingCsv(records);
  const url = URL.createObjectURL(
    new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `aionguard-click-timing.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
