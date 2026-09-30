import { isIP } from 'node:net';

export const FIXTURE_ID = 'acme-login' as const;
export const FIXTURE_PATH = '/acme-login.html';
export const BROWSER_VERSION = '1.58.2';
export const MAX_PNG_BYTES = 2_500_000;
export const MAX_RESULT_BYTES = 3_500_000;

export interface RegisteredFixture {
  id: typeof FIXTURE_ID;
  url: string;
  navigationOrigins: readonly string[];
  identityProviderOrigins: readonly string[];
}

export type FixtureTargetKind = 'auto' | 'origin' | 'url';

export interface FixtureTarget {
  origin: string;
  url: string;
  /** A trailing slash denotes a directory; other paths denote one resource. */
  protectionPath: string;
}

/** Registry configuration is administrator-owned; request bodies cannot add URLs. */
export function normalizePublicHttpsOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    isIP(url.hostname) ||
    !url.hostname.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)
  ) {
    throw new Error(
      'Expected a public HTTPS origin with no path, credentials, query, or non-default port',
    );
  }
  return url.origin;
}

/** Canonical, administrator-supplied target. Never normalize away ambiguous paths. */
export function normalizeFixtureTarget(
  value: string,
  kind: FixtureTargetKind = 'auto',
): FixtureTarget {
  const parsed = /^https:\/\/([^/]+)(\/.*)?$/i.exec(value);
  if (!parsed || parsed[1]!.includes(':') || /[\s\\%?#@]/.test(value))
    throw new Error('Expected an unambiguous public HTTPS fixture URL');
  const path = parsed[2] ?? '/';
  if (
    !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*$/.test(path) ||
    path.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('Fixture paths must not contain traversal or encoded delimiters');
  const url = new URL(value);
  if (url.username || url.password || url.port || url.pathname !== path)
    throw new Error('Expected a public HTTPS fixture URL without credentials or a port');
  const origin = normalizePublicHttpsOrigin(url.origin);
  if (kind === 'origin' && path !== '/')
    throw new Error('Fixture origin configuration must not include a path');
  if (kind === 'url' && path === '/')
    throw new Error('Explicit fixture URLs require a non-root path');
  const legacyOrigin = kind === 'origin' || (kind === 'auto' && path === '/');
  const targetPath = legacyOrigin ? FIXTURE_PATH : path;
  const directory = targetPath.slice(0, targetPath.lastIndexOf('/') + 1);
  return Object.freeze({
    origin,
    url: `${origin}${targetPath}`,
    // Legacy dedicated origins retain their original protection. Explicit
    // project URLs cover their directory; a root file never covers siblings.
    protectionPath: legacyOrigin
      ? '/'
      : targetPath.endsWith('/')
        ? targetPath
        : directory === '/'
          ? targetPath
          : directory,
  });
}

export function registeredFixture(
  target: string,
  identityProviderOrigins: readonly string[],
  kind: FixtureTargetKind = 'auto',
): RegisteredFixture {
  const normalized = normalizeFixtureTarget(target, kind);
  if (identityProviderOrigins.length < 1 || identityProviderOrigins.length > 8)
    throw new Error('An exact IdP-origin inventory is required');
  return Object.freeze({
    id: FIXTURE_ID,
    url: normalized.url,
    navigationOrigins: Object.freeze([normalized.origin]),
    identityProviderOrigins: Object.freeze(identityProviderOrigins.map(normalizePublicHttpsOrigin)),
  });
}

export function isAllowedNavigation(value: string, origins: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && !url.username && !url.password && origins.includes(url.origin)
    );
  } catch {
    return false;
  }
}

export function validPng(bytes: Uint8Array): boolean {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length < 45 ||
    buffer.length > MAX_PNG_BYTES ||
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  )
    return false;
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 1280 || height > 900) return false;
  // Reject truncated chunks and trailing/polyglot bytes before serving inert image/png.
  let offset = 8,
    seenData = false;
  while (offset + 12 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size > MAX_PNG_BYTES || offset + size + 12 > buffer.length) return false;
    if (type === 'IDAT') seenData = true;
    offset += size + 12;
    if (type === 'IEND') return size === 0 && seenData && offset === buffer.length;
  }
  return false;
}
