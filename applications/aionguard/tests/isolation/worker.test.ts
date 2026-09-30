import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { Sandbox } from '@vercel/sandbox';
import { allowedRequest, pageFacts, pathAllowed } from '../../src/server/isolation/worker.mjs';
import { prepareCleanImage } from '../../src/server/isolation/prepare-image.ts';

it.each([
  '/AionPhish/',
  '/AionPhish',
  '/AionPhish/index.html',
  '/AionPhish/assets/style.css?version=1',
  '/AionPhish/#section',
])('allows only GET/HEAD support requests within the project boundary: %s', (path) => {
  const url = `https://mfrey18.github.io${path}`;
  expect(pathAllowed(url, '/AionPhish/')).toBe(true);
  for (const method of ['GET', 'HEAD'])
    expect(allowedRequest(url, method, ['https://mfrey18.github.io'], '/AionPhish/')).toBe(true);
  for (const method of ['POST', 'PUT', 'DELETE'])
    expect(allowedRequest(url, method, ['https://mfrey18.github.io'], '/AionPhish/')).toBe(false);
});

it.each([
  '/',
  '/OtherProject/',
  '/AionPhishing/',
  '/AionPhish-other/',
  '/aionphish/',
  '/AionPhish/../OtherProject/',
  '/AionPhish/%2e%2e/OtherProject/',
  '/AionPhish/%2fOtherProject/',
  '/AionPhish/%252fOtherProject/',
  '/AionPhish/%5cOtherProject/',
  '/AionPhish\\OtherProject/',
  '/AionPhish//assets/style.css',
])('rejects siblings and ambiguous project paths: %s', (path) => {
  const url = `https://mfrey18.github.io${path}`;
  expect(pathAllowed(url, '/AionPhish/')).toBe(false);
  expect(allowedRequest(url, 'GET', ['https://mfrey18.github.io'], '/AionPhish/')).toBe(false);
});

it('preserves origin and credential restrictions alongside path scope and legacy root assets', () => {
  for (const url of [
    'https://other.github.io/AionPhish/',
    'http://mfrey18.github.io/AionPhish/',
    'https://user:secret@mfrey18.github.io/AionPhish/',
  ])
    expect(allowedRequest(url, 'GET', ['https://mfrey18.github.io'], '/AionPhish/')).toBe(false);
  expect(
    allowedRequest('https://fixture.example/style.css', 'GET', ['https://fixture.example'], '/'),
  ).toBe(true);
  expect(
    allowedRequest(
      'https://fixture.example/assets/with%20space.png',
      'GET',
      ['https://fixture.example'],
      '/',
    ),
  ).toBe(true);
  expect(pathAllowed('https://mfrey18.github.io/AionPhish/', '/AionPhish/../')).toBe(false);
});

it('resolves relative declared form actions and clips page-derived display text', () => {
  const form = { getAttribute: () => '../outside/login' },
    input = { form };
  const facts = runInNewContext(`(${pageFacts.toString()})()`, {
    URL,
    document: {
      title: 'Acme ' + 'x'.repeat(300),
      body: { innerText: 'Acme ' + 'x'.repeat(2000) },
      baseURI: 'https://fixture.example/nested/page',
      querySelector: (selector: string) => (selector.startsWith('input') ? input : form),
      querySelectorAll: () => [input],
    },
    location: { href: 'https://fixture.example/nested/page' },
  });
  expect(facts).toMatchObject({
    claimedService: 'ACME',
    passwordField: true,
    formAction: 'https://fixture.example/outside/login',
    formDestinationOrigin: 'https://fixture.example',
  });
  expect(facts.title).toHaveLength(200);
  expect(facts.text).toHaveLength(1000);
});

it.each([
  { title: 'AionPhish', text: 'Sign in to AionPhish', brand: 'AIONPHISH' },
  { title: 'Sign in', text: 'Welcome to aIoNpHiSh.', brand: 'AIONPHISH' },
  { title: 'ACME', text: 'Sign in to Acme', brand: 'ACME' },
  { title: 'Sign in', text: 'Another service', brand: 'UNKNOWN' },
  { title: 'AionPhishing', text: 'acmecompany', brand: 'UNKNOWN' },
  { title: 'AionPhish', text: 'ACME sign in', brand: 'UNKNOWN' },
  { title: 'Acme and AionPhish', text: '', brand: 'UNKNOWN' },
])('observes supported branding without guessing from form URLs: $title / $text', (sample) => {
  const form = Object.freeze({
    getAttribute: () => 'https://acme-auth-collector.invalid/session?marker=AG_PAGE_ACTION_7C92',
  });
  const input = Object.freeze({ form, disabled: true, value: '' });
  const facts = runInNewContext(`(${pageFacts.toString()})()`, {
    URL,
    document: {
      title: sample.title,
      body: { innerText: sample.text },
      baseURI: 'https://mfrey18.github.io/AionPhish/',
      querySelector: (selector: string) => (selector.startsWith('input') ? input : form),
      querySelectorAll: () => [input],
    },
    location: { href: 'https://mfrey18.github.io/AionPhish/' },
  });
  expect(facts).toMatchObject({
    claimedService: sample.brand,
    passwordField: true,
    formAction: 'https://acme-auth-collector.invalid/session?marker=AG_PAGE_ACTION_7C92',
    formDestinationOrigin: 'https://acme-auth-collector.invalid',
  });
  expect(input).toMatchObject({ disabled: true, value: '' });
});

it('retains an observed brand without inventing a malformed form destination', () => {
  const form = { getAttribute: () => 'https://[' };
  const input = { form, disabled: true };
  const facts = runInNewContext(`(${pageFacts.toString()})()`, {
    URL,
    document: {
      title: 'AionPhish',
      body: { innerText: 'Inert authentication fixture' },
      baseURI: 'https://mfrey18.github.io/AionPhish/',
      querySelector: (selector: string) => (selector.startsWith('input') ? input : form),
      querySelectorAll: () => [input],
    },
    location: { href: 'https://mfrey18.github.io/AionPhish/' },
  });
  expect(facts).toMatchObject({
    claimedService: 'AIONPHISH',
    passwordField: true,
    formAction: null,
    formDestinationOrigin: null,
  });
});

it('keeps a document identity check around PNG capture and disables active page behavior', async () => {
  const source = await readFile(
    new URL('../../src/server/isolation/worker.mjs', import.meta.url),
    'utf8',
  );
  expect(source).toContain('javaScriptEnabled: false');
  expect(source).toContain("serviceWorkers: 'block'");
  expect(source).toContain('acceptDownloads: false');
  expect(source).toContain('documentRevision !== observedRevision');
  expect(source.indexOf("context.route('**/*'")).toBeLessThan(source.indexOf('page.goto('));
});

it('does not create a snapshot or VM unless the administrative build is explicitly enabled', async () => {
  const previous = process.env.AIONGUARD_IMAGE_BUILD_CONFIRM;
  delete process.env.AIONGUARD_IMAGE_BUILD_CONFIRM;
  const create = vi.spyOn(Sandbox, 'create');
  try {
    await expect(prepareCleanImage('/not-written.json')).rejects.toThrow('explicitly enabled');
    expect(create).not.toHaveBeenCalled();
  } finally {
    create.mockRestore();
    if (previous !== undefined) process.env.AIONGUARD_IMAGE_BUILD_CONFIRM = previous;
  }
});
