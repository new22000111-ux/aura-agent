/**
 * Security utility for URL validation and sanitization.
 */

/**
 * Validates a URL to ensure it uses allowed protocols and does not point to restricted addresses.
 * @param urlString The URL string to validate.
 * @returns true if the URL is considered safe to fetch, false otherwise.
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow http and https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost and common loopback addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    ) {
      return false;
    }

    // Block private IP ranges (IPv4)
    // 10.0.0.0/8
    // 172.16.0.0 - 172.31.255.255
    // 192.168.0.0/16
    // 169.254.0.0/16 (link-local)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const [, o1, o2] = match.map(Number);
      if (o1 === 10) return false;
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
      if (o1 === 192 && o2 === 168) return false;
      if (o1 === 169 && o2 === 254) return false;
    }

    // Block IPv6 local/private (simplified check)
    if (hostname.startsWith('[f') || hostname.startsWith('[fe80')) {
        return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}
