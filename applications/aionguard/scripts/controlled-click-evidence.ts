import { z } from 'zod';

const NetLogSchema = z.object({
  constants: z.object({ logEventTypes: z.record(z.string(), z.number()) }),
  events: z.array(
    z.object({
      type: z.number(),
      source: z.object({ id: z.number() }),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});
const sendTypes = [
  'HTTP_TRANSACTION_SEND_REQUEST_HEADERS',
  'HTTP_TRANSACTION_HTTP2_SEND_REQUEST_HEADERS',
  'HTTP_TRANSACTION_QUIC_SEND_REQUEST_HEADERS',
] as const;

/** Only actual HTTP transaction header-send events count; attempted URLs do not.
 * Raw NetLog headers are deliberately not copied to the evidence report.
 * Chrome reuses a URL_REQUEST source through redirects. Attribute each send to
 * its latest START_JOB, rather than every URL ever seen on that source.
 * Missing capture vocabulary or unattributed sends fail qualification closed.
 */
export function summarizeNetLog(input: unknown, destination: string, canaryOrigin: string) {
  const log = NetLogSchema.parse(input);
  const types = log.constants.logEventTypes;
  if (
    types.URL_REQUEST_START_JOB === undefined ||
    sendTypes.some((name) => types[name] === undefined)
  )
    throw new Error('NETLOG_EVENT_TYPES');
  const sends = new Map(sendTypes.map((name) => [types[name]!, name]));
  const target = new URL(destination);
  const latestUrl = new Map<number, URL>();
  const events: { sourceId: number; event: string; url: string }[] = [];
  let canaryRequestsSent = 0;
  let totalRequestsSent = 0;
  for (const event of log.events) {
    if (event.type === types.URL_REQUEST_START_JOB && typeof event.params?.url === 'string') {
      latestUrl.set(event.source.id, new URL(event.params.url));
    }
    const name = sends.get(event.type);
    if (!name) continue;
    totalRequestsSent++;
    const url = latestUrl.get(event.source.id);
    if (!url) throw new Error('NETLOG_UNATTRIBUTED_SEND');
    if (url.origin === canaryOrigin) canaryRequestsSent++;
    if (url.origin === target.origin) {
      events.push({ sourceId: event.source.id, event: name, url: url.origin + url.pathname });
    }
  }
  if (!canaryRequestsSent) throw new Error('NETLOG_CANARY_ABSENT');
  return {
    destinationOrigin: target.origin,
    destinationRequestsSent: events.length,
    destinationDocumentRequestsSent: events.filter(
      (event) => new URL(event.url).pathname === target.pathname,
    ).length,
    canaryRequestsSent,
    totalRequestsSent,
    events,
    method: 'CHROMIUM_NETLOG_HTTP_TRANSACTION_HEADER_SEND' as const,
  };
}

export function validateControlledComparison(
  baseline: ReturnType<typeof summarizeNetLog>,
  protectedRun: ReturnType<typeof summarizeNetLog>,
) {
  if (baseline.destinationOrigin !== protectedRun.destinationOrigin)
    throw new Error('DESTINATION_MISMATCH');
  if (baseline.destinationDocumentRequestsSent < 1) throw new Error('BASELINE_DID_NOT_SEND');
  if (protectedRun.destinationRequestsSent !== 0)
    throw new Error('PROTECTED_DESTINATION_REQUEST_SENT');
  return true as const;
}
