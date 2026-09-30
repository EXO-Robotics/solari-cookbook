export function pathAllowed(url: string, requestPath: string): boolean;
export function allowedRequest(
  url: string,
  method: string,
  allowedOrigins: readonly string[],
  requestPath?: string,
): boolean;
export function pageFacts(): {
  title: string;
  text: string;
  claimedService: 'ACME' | 'AIONPHISH' | 'UNKNOWN';
  passwordField: boolean;
  formAction: string | null;
  formDestinationOrigin: string | null;
  downloadLinks: { href: string; text: string }[];
};
export function main(): Promise<void>;
