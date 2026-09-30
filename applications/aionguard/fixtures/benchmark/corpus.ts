/** Fixed synthetic scenario intent, selected before running the detector. Five surface variants per template are correlated, not independent samples. */
export type Expected = 'MALICIOUS' | 'BENIGN' | 'AMBIGUOUS';
const login = '<form action="/session"><input type="password"><button>Sign in</button></form>';
const externalLogin =
  '<form action="https://collector.aionguard.invalid/session"><input type="password"><button>Sign in</button></form>';
const download = '<a href="/package.exe">Download</a>';
type Template = {
  id: string;
  group: string;
  expected: Expected;
  body: string;
  trusted?: boolean;
  redirect?: boolean;
};
export const templates: Template[] = [
  { id: 'news', group: 'benign', expected: 'BENIGN', body: 'Community news and upcoming events.' },
  {
    id: 'docs',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Read the API reference and integration guide.',
  },
  {
    id: 'store',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Browse our catalog. Shipping information.',
  },
  { id: 'trusted-login', group: 'benign', expected: 'BENIGN', body: login, trusted: true },
  {
    id: 'unlisted-login',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Legitimate small business member portal.' + login,
  },
  {
    id: 'external-sso',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Legitimate enterprise single sign on.' + externalLogin,
  },
  {
    id: 'support-education',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Training example: Your computer is infected. Call support immediately. This is a scam example; do not call.',
  },
  {
    id: 'command-tutorial',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Developer tutorial: to fix the error, run this command in terminal. This is documentation.',
  },
  {
    id: 'legitimate-installer',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Required security update for our legitimate application.' + download,
  },
  {
    id: 'plain-support',
    group: 'benign',
    expected: 'BENIGN',
    body: 'Contact support for help with your subscription.',
  },
  {
    id: 'credential-mail',
    group: 'credential',
    expected: 'MALICIOUS',
    body: 'Mailbox expired. Enter your password.' + login,
  },
  {
    id: 'credential-payroll',
    group: 'credential',
    expected: 'MALICIOUS',
    body: 'Payroll access verification.' + externalLogin,
  },
  {
    id: 'credential-shared-file',
    group: 'credential',
    expected: 'MALICIOUS',
    body: 'Sign in to view a confidential shared document.' + login,
  },
  {
    id: 'credential-text-only',
    group: 'credential',
    expected: 'MALICIOUS',
    body: 'Send your account password to the administrator to restore access.',
  },
  {
    id: 'brand-mail-login',
    group: 'brand-mismatch',
    expected: 'MALICIOUS',
    body: 'ExampleMail official secure account center.' + login,
  },
  {
    id: 'brand-bank-login',
    group: 'brand-mismatch',
    expected: 'MALICIOUS',
    body: 'ExampleBank account verification.' + externalLogin,
  },
  {
    id: 'brand-mail-text',
    group: 'brand-mismatch',
    expected: 'MALICIOUS',
    body: 'ExampleMail official account recovery. Contact our agent with your recovery code.',
  },
  {
    id: 'brand-bank-text',
    group: 'brand-mismatch',
    expected: 'MALICIOUS',
    body: 'ExampleBank secure verification. Transfer funds to the replacement account.',
  },
  {
    id: 'redirect-login',
    group: 'redirect',
    expected: 'MALICIOUS',
    body: 'Redirect destination: account verification.' + login,
    redirect: true,
  },
  {
    id: 'redirect-external-form',
    group: 'redirect',
    expected: 'MALICIOUS',
    body: 'Redirect destination: shared file.' + externalLogin,
    redirect: true,
  },
  {
    id: 'redirect-text',
    group: 'redirect',
    expected: 'MALICIOUS',
    body: 'Redirect destination: send your recovery code to our agent.',
    redirect: true,
  },
  {
    id: 'redirect-payload',
    group: 'redirect',
    expected: 'MALICIOUS',
    body: 'Redirect destination: download this file.' + download,
    redirect: true,
  },
  {
    id: 'download-update',
    group: 'download',
    expected: 'MALICIOUS',
    body: 'Urgent security update required.' + download,
  },
  {
    id: 'download-codec',
    group: 'download',
    expected: 'MALICIOUS',
    body: 'Install the codec to watch this video.<a href="/codec.msi">Install</a>',
  },
  {
    id: 'download-plain',
    group: 'download',
    expected: 'MALICIOUS',
    body: 'Your shared invoice.<a href="/invoice.exe">View file</a>',
  },
  {
    id: 'download-extensionless',
    group: 'download',
    expected: 'MALICIOUS',
    body: 'Critical update required.<a href="/download">Get update</a>',
  },
  {
    id: 'mixed-clickfix',
    group: 'mixed',
    expected: 'MALICIOUS',
    body: 'Verify you are human: paste this command into terminal.',
  },
  {
    id: 'mixed-support',
    group: 'mixed',
    expected: 'MALICIOUS',
    body: 'Your device is locked. Call support immediately.',
  },
  {
    id: 'ambiguous-login',
    group: 'mixed',
    expected: 'AMBIGUOUS',
    body: 'Unknown community login with insufficient ownership evidence.' + login,
  },
  {
    id: 'ambiguous-update',
    group: 'mixed',
    expected: 'AMBIGUOUS',
    body: 'Required application update; publisher ownership is unknown.' + download,
  },
];
export function createCorpus() {
  return templates.flatMap((template) =>
    Array.from({ length: 5 }, (_, index) => {
      const id = `${template.id}-${index + 1}`;
      const origin = template.trusted
        ? 'https://trusted.aionguard.invalid'
        : 'https://owned.aionguard.invalid';
      const url = `${origin}/${id}.html`;
      return {
        id,
        template: template.id,
        group: template.group,
        expected: template.expected,
        variant: index + 1,
        url,
        finalUrl: template.redirect ? `${origin}/${id}-destination.html` : url,
        html: `<!doctype html><html><head><title>Scenario ${id}</title></head><body><h1>Case ${index + 1}</h1>${template.body}<p>Reference ${100 + index}; locale en; sample ${index + 1}.</p></body></html>`,
      };
    }),
  );
}
