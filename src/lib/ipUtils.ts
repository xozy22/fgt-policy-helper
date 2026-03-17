export function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

export function intToIp(n: number): string {
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join('.');
}

export function cidrToSubnetMask(prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(mask);
}

export function subnetMaskToPrefix(mask: string): number {
  const n = ipToInt(mask);
  let count = 0;
  for (let i = 31; i >= 0; i--) {
    if ((n >>> i) & 1) count++;
    else break;
  }
  return count;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  if (!network || !prefixStr) return false;
  const prefix = parseInt(prefixStr, 10);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) >>> 0 === (ipToInt(network) & mask) >>> 0;
}

export function isIpInRange(ip: string, start: string, end: string): boolean {
  const ipInt = ipToInt(ip);
  return ipInt >= ipToInt(start) && ipInt <= ipToInt(end);
}

/**
 * Given a list of IPs, suggests the smallest covering subnet.
 * Returns a CIDR string like "192.168.11.0/24".
 */
export function guessSubnetFromIps(ips: string[]): string {
  if (ips.length === 0) return '0.0.0.0/0';
  if (ips.length === 1) return `${ips[0]}/32`;

  const ints = ips.map(ipToInt);
  let commonBits = 32;
  const first = ints[0]!;

  for (const n of ints) {
    let diff = first ^ n;
    let bits = 0;
    while (diff > 0) {
      diff >>>= 1;
      bits++;
    }
    commonBits = Math.min(commonBits, 32 - bits);
  }

  const mask = commonBits === 0 ? 0 : (0xffffffff << (32 - commonBits)) >>> 0;
  const networkInt = (first & mask) >>> 0;
  return `${intToIp(networkInt)}/${commonBits}`;
}

export function isValidIp(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(p => parseInt(p, 10) <= 255);
}

export function isValidCidr(cidr: string): boolean {
  const [ip, prefix] = cidr.split('/');
  if (!ip || !prefix) return false;
  const p = parseInt(prefix, 10);
  return isValidIp(ip) && p >= 0 && p <= 32;
}

export function isValidRange(range: string): boolean {
  const [start, end] = range.split('-');
  if (!start || !end) return false;
  return isValidIp(start.trim()) && isValidIp(end.trim());
}

/** Sanitize a name for FortiGate CLI (alphanumeric, dash, underscore, dot) */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/^-+|-+$/g, '');
}
