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

/**
 * 64-bit deterministic hash (two independent djb2 passes).
 * Yields 16 hex chars — collision-resistant for any realistic log size.
 */
function stableId(key: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
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
        id: stableId(key),
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
