import type { RawLogEntry } from './logParser';
import type { TrafficEntry } from '../types/traffic';

function protoLabel(proto: number): string {
  switch (proto) {
    case 1: return 'ICMP';
    case 6: return 'TCP';
    case 17: return 'UDP';
    case 47: return 'GRE';
    case 50: return 'ESP';
    default: return `proto(${proto})`;
  }
}

function buildDedupKey(e: RawLogEntry): string {
  return `${e.srcip}|${e.srcport}|${e.srcintf}|${e.dstip}|${e.dstport}|${e.dstintf}|${e.proto}`;
}

/** Simple deterministic ID from string (djb2-like, hex) */
function hashKey(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function deduplicateEntries(raw: RawLogEntry[]): TrafficEntry[] {
  const map = new Map<string, TrafficEntry>();

  for (const e of raw) {
    const key = buildDedupKey(e);
    const existing = map.get(key);

    if (existing) {
      existing.hitCount++;
    } else {
      map.set(key, {
        id: hashKey(key),
        srcip: e.srcip,
        srcport: e.srcport,
        srcintf: e.srcintf,
        dstip: e.dstip,
        dstport: e.dstport,
        dstintf: e.dstintf,
        proto: e.proto,
        protoLabel: protoLabel(e.proto),
        action: e.action,
        hitCount: 1,
        consumedByPolicyId: null,
      });
    }
  }

  return Array.from(map.values());
}
