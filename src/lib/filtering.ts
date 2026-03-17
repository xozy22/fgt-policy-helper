import type { TrafficEntry, ActiveFilters, FilterCriterion, FilterOperator } from '../types/traffic';
import { isIpInCidr, isIpInRange, isValidCidr, isValidRange } from './ipUtils';

function matchesIpFilter(ip: string, value: string, op: FilterOperator): boolean {
  const v = value.trim();
  switch (op) {
    case 'equals': return ip === v;
    case 'not_equals': return ip !== v;
    case 'contains': return ip.includes(v);
    case 'in_subnet':
      if (isValidCidr(v)) return isIpInCidr(ip, v);
      return ip === v;
    case 'in_range':
      if (isValidRange(v)) {
        const [start, end] = v.split('-');
        return isIpInRange(ip, start!.trim(), end!.trim());
      }
      if (isValidCidr(v)) return isIpInCidr(ip, v);
      return ip === v;
    default: return false;
  }
}

function matchesPortFilter(port: number, value: string, op: FilterOperator): boolean {
  const v = value.trim();
  // Comma-separated list
  if (v.includes(',')) {
    const ports = v.split(',').map(p => parseInt(p.trim(), 10));
    const inList = ports.includes(port);
    return op === 'not_equals' ? !inList : inList;
  }
  // Range like "8080-8090"
  if (v.includes('-') && !v.startsWith('-')) {
    const [start, end] = v.split('-').map(p => parseInt(p.trim(), 10));
    const inRange = port >= (start ?? 0) && port <= (end ?? 65535);
    return op === 'not_equals' ? !inRange : inRange;
  }
  const num = parseInt(v, 10);
  switch (op) {
    case 'equals': return port === num;
    case 'not_equals': return port !== num;
    case 'in_range':
    case 'in_subnet':
    case 'contains': return port === num;
    default: return false;
  }
}

function matchesStringFilter(val: string, value: string, op: FilterOperator): boolean {
  const v = value.trim().toLowerCase();
  const target = val.toLowerCase();
  switch (op) {
    case 'equals': return target === v;
    case 'not_equals': return target !== v;
    case 'contains': return target.includes(v);
    default: return target === v;
  }
}

function matchesProtoFilter(proto: number, value: string, op: FilterOperator): boolean {
  const v = value.trim().toUpperCase();
  let protoNum: number;
  switch (v) {
    case 'TCP': protoNum = 6; break;
    case 'UDP': protoNum = 17; break;
    case 'ICMP': protoNum = 1; break;
    case 'GRE': protoNum = 47; break;
    case 'ESP': protoNum = 50; break;
    default: protoNum = parseInt(value.trim(), 10);
  }
  switch (op) {
    case 'equals': return proto === protoNum;
    case 'not_equals': return proto !== protoNum;
    default: return proto === protoNum;
  }
}

function matchesCriterion(entry: TrafficEntry, criterion: FilterCriterion): boolean {
  const { field, operator, value } = criterion;
  if (!value.trim()) return true; // empty filter matches everything

  switch (field) {
    case 'srcip': return matchesIpFilter(entry.srcip, value, operator);
    case 'dstip': return matchesIpFilter(entry.dstip, value, operator);
    case 'srcport': return matchesPortFilter(entry.srcport, value, operator);
    case 'dstport': return matchesPortFilter(entry.dstport, value, operator);
    case 'srcintf': return matchesStringFilter(entry.srcintf, value, operator);
    case 'dstintf': return matchesStringFilter(entry.dstintf, value, operator);
    case 'proto': return matchesProtoFilter(entry.proto, value, operator);
    case 'action': return matchesStringFilter(entry.action, value, operator);
    default: return true;
  }
}

export function applyFilters(entries: TrafficEntry[], filters: ActiveFilters): TrafficEntry[] {
  const { criteria } = filters;
  const activeCriteria = criteria.filter(c => c.value.trim() !== '');

  if (activeCriteria.length === 0) return entries;

  return entries.filter(entry => {
    // Left-to-right evaluation: each criterion's connector determines how it
    // combines with the criterion that follows it.
    // Example: A(AND) B(OR) C  →  ((A AND B) OR C)
    let result = matchesCriterion(entry, activeCriteria[0]!);
    for (let i = 1; i < activeCriteria.length; i++) {
      const prev = activeCriteria[i - 1]!;
      const curr = activeCriteria[i]!;
      if (prev.connector === 'AND') {
        result = result && matchesCriterion(entry, curr);
      } else {
        result = result || matchesCriterion(entry, curr);
      }
    }
    return result;
  });
}
