import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_ID, normalizeFixtureTarget } from '../../server/isolation/policy.ts';

export interface ControlledChromeDemoConfig {
  fixtureUrl: string;
  controllerOrigin: string;
  sourceOrigin: string;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The destination is registered at build time, never accepted from a clicked page. */
export function controlledChromeArtifacts(config: ControlledChromeDemoConfig) {
  const target = normalizeFixtureTarget(config.fixtureUrl, 'url');
  const controller = new URL(config.controllerOrigin);
  if (
    controller.origin !== config.controllerOrigin ||
    controller.protocol !== 'http:' ||
    controller.hostname !== '127.0.0.1' ||
    !controller.port ||
    Number(controller.port) < 1024 ||
    controller.username ||
    controller.password
  )
    throw new Error('The demo controller must be an exact 127.0.0.1 HTTP origin');
  const source = new URL(config.sourceOrigin);
  if (
    source.origin !== config.sourceOrigin ||
    source.protocol !== 'http:' ||
    source.hostname !== '127.0.0.1' ||
    !source.port ||
    Number(source.port) < 1024 ||
    source.username ||
    source.password
  )
    throw new Error('The demo source must be an exact 127.0.0.1 HTTP origin');
  const protectedPath = target.protectionPath;
  const blockPattern = protectedPath.endsWith('/')
    ? `^${escapeRegex(target.origin + protectedPath.slice(0, -1))}(?:[/?#].*)?$`
    : `^${escapeRegex(target.origin + protectedPath)}(?:[?#].*)?$`;
  const rules = [
    {
      id: 7101,
      priority: 20,
      action: { type: 'redirect', redirect: { extensionPath: '/hold.html' } },
      condition: {
        regexFilter: `^${escapeRegex(target.url)}$`,
        isUrlFilterCaseSensitive: true,
        resourceTypes: ['main_frame'],
      },
    },
    {
      id: 7102,
      priority: 10,
      action: { type: 'block' },
      condition: {
        regexFilter: blockPattern,
        isUrlFilterCaseSensitive: true,
        resourceTypes: [
          'main_frame',
          'sub_frame',
          'stylesheet',
          'script',
          'image',
          'font',
          'object',
          'xmlhttprequest',
          'ping',
          'csp_report',
          'media',
          'websocket',
          'webtransport',
          'webbundle',
          'other',
        ],
      },
    },
  ];
  const manifest = {
    manifest_version: 3,
    name: 'AionGuard · controlled click demo',
    version: '1.0.0',
    description: 'Disposable-profile demonstration for one owned registered fixture.',
    minimum_chrome_version: '120',
    permissions: ['declarativeNetRequest', 'storage', 'alarms', 'webNavigation'],
    host_permissions: [`${target.origin}/*`, `${controller.origin}/*`],
    background: { service_worker: 'background.js' },
    web_accessible_resources: [
      {
        resources: ['hold.html'],
        matches: [
          ...new Set([`${target.origin}/*`, `${controller.origin}/*`, `${source.origin}/*`]),
        ],
      },
    ],
    content_security_policy: {
      extension_pages: `default-src 'none'; script-src 'self'; style-src 'self'; connect-src ${controller.origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
    },
  };
  const workerConfig = `globalThis.AIONGUARD_CHROME = Object.freeze(${JSON.stringify({
    fixtureId: FIXTURE_ID,
    fixtureUrl: target.url,
    controllerOrigin: controller.origin,
    rules,
  })});\n`;
  return { manifest, rules, workerConfig };
}

export async function buildControlledChromeDemo(
  config: ControlledChromeDemoConfig,
  outputDirectory: string,
) {
  const artifacts = controlledChromeArtifacts(config);
  const directory = resolve(outputDirectory);
  const resources = fileURLToPath(new URL('./resources', import.meta.url));
  if (directory === resources || directory.startsWith(`${resources}/`))
    throw new Error('Choose a separate build output directory');
  await mkdir(directory, { recursive: true });
  await cp(resources, directory, { recursive: true });
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(artifacts.manifest, null, 2));
  await writeFile(resolve(directory, 'config.js'), artifacts.workerConfig);
  return { directory, manifest: artifacts.manifest, rules: artifacts.rules };
}
