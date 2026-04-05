import { lookup } from 'dns/promises';
import { logger } from './logger.js';

const PRIVATE_RANGES = [
  // IPv4
  { prefix: '10.', label: 'RFC1918' },
  { prefix: '172.16.', label: 'RFC1918' },
  { prefix: '172.17.', label: 'RFC1918' },
  { prefix: '172.18.', label: 'RFC1918' },
  { prefix: '172.19.', label: 'RFC1918' },
  { prefix: '172.20.', label: 'RFC1918' },
  { prefix: '172.21.', label: 'RFC1918' },
  { prefix: '172.22.', label: 'RFC1918' },
  { prefix: '172.23.', label: 'RFC1918' },
  { prefix: '172.24.', label: 'RFC1918' },
  { prefix: '172.25.', label: 'RFC1918' },
  { prefix: '172.26.', label: 'RFC1918' },
  { prefix: '172.27.', label: 'RFC1918' },
  { prefix: '172.28.', label: 'RFC1918' },
  { prefix: '172.29.', label: 'RFC1918' },
  { prefix: '172.30.', label: 'RFC1918' },
  { prefix: '172.31.', label: 'RFC1918' },
  { prefix: '192.168.', label: 'RFC1918' },
  { prefix: '127.', label: 'loopback' },
  { prefix: '169.254.', label: 'link-local' },
  { prefix: '0.', label: 'unspecified' },
  // IPv6
  { prefix: '::1', label: 'loopback' },
  { prefix: 'fe80:', label: 'link-local' },
  { prefix: 'fc00:', label: 'unique-local' },
  { prefix: 'fd', label: 'unique-local' },
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => ip.startsWith(r.prefix));
}

const DEFAULT_TIMEOUT = 5000;
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const MAX_REDIRECTS = 3;

/**
 * SSRF-safe fetch that blocks private IPs and enforces HTTPS.
 */
export async function safeFetch(
  url: string,
  options?: { timeout?: number; maxBodySize?: number },
): Promise<Response> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const maxBodySize = options?.maxBodySize ?? MAX_BODY_SIZE;

  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`safeFetch: only HTTPS allowed, got ${parsed.protocol}`);
  }

  // Resolve DNS and check IP
  const { address } = await lookup(parsed.hostname);
  if (isPrivateIp(address)) {
    logger.warn({ url, resolvedIp: address }, 'ssrf_blocked');
    throw new Error(`safeFetch: blocked request to private IP ${address}`);
  }

  let redirectCount = 0;
  let currentUrl = url;

  while (redirectCount <= MAX_REDIRECTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
      });

      // Handle redirects manually to validate each hop
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error(`safeFetch: too many redirects (>${MAX_REDIRECTS})`);
        }
        const nextUrl = new URL(response.headers.get('location')!, currentUrl);
        if (nextUrl.protocol !== 'https:') {
          throw new Error(`safeFetch: redirect to non-HTTPS URL blocked`);
        }
        const { address: nextIp } = await lookup(nextUrl.hostname);
        if (isPrivateIp(nextIp)) {
          logger.warn({ url: nextUrl.href, resolvedIp: nextIp }, 'ssrf_redirect_blocked');
          throw new Error(`safeFetch: redirect to private IP ${nextIp} blocked`);
        }
        currentUrl = nextUrl.href;
        continue;
      }

      // Check Content-Length if available
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxBodySize) {
        throw new Error(`safeFetch: response too large (${contentLength} bytes)`);
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`safeFetch: too many redirects`);
}
