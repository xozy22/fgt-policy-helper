export interface TrafficEntry {
  id: string;               // hash of the 7-tuple dedup key
  srcip: string;
  srcport: number;
  srcintf: string;
  dstip: string;
  dstport: number;
  dstintf: string;
  proto: number;            // 6=TCP, 17=UDP, 1=ICMP
  protoLabel: string;       // "TCP" | "UDP" | "ICMP" | "proto(N)"
  action: string;           // "accept" | "deny"
  hitCount: number;
  consumedByPolicyId: string | null;
}

export type FilterField =
  | 'srcip'
  | 'dstip'
  | 'srcport'
  | 'dstport'
  | 'srcintf'
  | 'dstintf'
  | 'proto'
  | 'action';

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'in_range'
  | 'in_subnet';

export interface FilterCriterion {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
  /** How this criterion joins with the NEXT one (ignored for the last criterion). */
  connector: 'AND' | 'OR';
}

export interface ActiveFilters {
  criteria: FilterCriterion[];
}
