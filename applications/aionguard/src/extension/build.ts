import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIXTURE_ID,
  normalizeFixtureTarget,
  type FixtureTargetKind,
} from '../server/isolation/policy.ts';

const CONTROLLER_ORIGIN = 'http://127.0.0.1:4317';
const regexEscape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build-time registry substitution; the extension never accepts destinations from a web page. */
export function extensionArtifacts(fixtureTarget: string, kind: FixtureTargetKind = 'auto') {
  const target = normalizeFixtureTarget(fixtureTarget, kind);
  const { origin, protectionPath } = target;
  const blockPattern =
    protectionPath === '/'
      ? `^${regexEscape(origin)}/`
      : protectionPath.endsWith('/')
        ? `^${regexEscape(origin + protectionPath.slice(0, -1))}(?:[/?#].*)?$`
        : `^${regexEscape(origin + protectionPath)}(?:[?#].*)?$`;
  const manifest = {
    manifest_version: 3,
    name: 'AionGuard',
    version: '0.1.0',
    description:
      'Hold the registered inspection fixture before navigation. Requires the local AionGuard controller.',
    permissions: [
      'declarativeNetRequest',
      'declarativeNetRequestWithHostAccess',
      'storage',
      'alarms',
      'nativeMessaging',
    ],
    host_permissions: [`${origin}/*`, `${CONTROLLER_ORIGIN}/*`],
    background: { scripts: ['config.js', 'background.js'] },
    action: { default_title: 'AionGuard settings', default_popup: 'options.html' },
    options_ui: { page: 'options.html' },
    declarative_net_request: {
      rule_resources: [{ id: 'registered_fixture', enabled: false, path: 'rules.json' }],
    },
    web_accessible_resources: [
      {
        resources: ['hold.html', 'hold.js', 'styles.css', 'config.js', 'recovery.js'],
        matches: [`${origin}/*`],
      },
    ],
    content_security_policy: {
      extension_pages: `default-src 'none'; script-src 'self'; style-src 'self'; connect-src ${CONTROLLER_ORIGIN}; object-src 'none'; base-uri 'none'`,
    },
  };
  const rules = [
    {
      id: 1,
      priority: 20,
      action: { type: 'redirect', redirect: { extensionPath: '/hold.html' } },
      condition: {
        regexFilter: `^${regexEscape(target.url)}(?:[?#].*)?$`,
        isUrlFilterCaseSensitive: true,
        resourceTypes: ['main_frame'],
      },
    },
    // Block this registered directory/resource, including subframes and prefetches.
    // A project URL must not restrict sibling projects on the same hosted origin.
    {
      id: 2,
      priority: 10,
      action: { type: 'block' },
      condition: { regexFilter: blockPattern, isUrlFilterCaseSensitive: true },
    },
  ];
  const config = `globalThis.AIONGUARD = Object.freeze(${JSON.stringify({ controllerOrigin: CONTROLLER_ORIGIN, fixtureId: FIXTURE_ID, rules })});\n`;
  return { manifest, rules, config };
}

export async function buildExtension(
  fixtureTarget: string,
  outputDirectory: string,
  kind: FixtureTargetKind = 'auto',
): Promise<void> {
  const artifacts = extensionArtifacts(fixtureTarget, kind);
  const output = resolve(outputDirectory);
  const resources = fileURLToPath(new URL('./resources', import.meta.url));
  if (output === resources || output.startsWith(`${resources}/`))
    throw new Error('Choose a separate build output directory');
  await mkdir(output, { recursive: true });
  await cp(resources, output, { recursive: true });
  await writeFile(
    resolve(output, 'manifest.json'),
    `${JSON.stringify(artifacts.manifest, null, 2)}\n`,
  );
  await writeFile(resolve(output, 'rules.json'), `${JSON.stringify(artifacts.rules, null, 2)}\n`);
  await writeFile(resolve(output, 'config.js'), artifacts.config);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const origin = process.argv[2],
    output = process.argv[3];
  if (!origin || !output) {
    process.stderr.write(
      'Usage: tsx src/extension/build.ts <registered-https-origin-or-url> <output-directory>\n',
    );
    process.exitCode = 1;
  } else
    buildExtension(origin, output).catch(() => {
      process.stderr.write('Extension build failed: validate the origin and output directory.\n');
      process.exitCode = 1;
    });
}
