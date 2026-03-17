export type AddressObjectType = 'host' | 'subnet' | 'range';

export interface AddressObject {
  id: string;
  name: string;
  type: AddressObjectType;
  ip: string;
  mask?: string;    // for subnet: e.g. "255.255.255.0"
  endIp?: string;  // for range: end IP
  sourceIps: string[];
}

export interface AddressGroup {
  id: string;
  name: string;
  members: string[]; // AddressObject.name or AddressGroup.name
  comment?: string;
}

export interface ServiceObject {
  id: string;
  name: string;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'ANY';
  portRange?: string; // e.g. "1883" or "8080-8090"
}

export interface FirewallPolicy {
  id: string;
  name: string;
  srcintf: string;
  dstintf: string;
  srcaddr: string;      // AddressObject/Group name or "all"
  dstaddr: string;
  service: string[];    // ServiceObject names or ["ALL"]
  action: 'accept' | 'deny';
  logtraffic: 'all' | 'utm' | 'disable';
  schedule: string;
  comment?: string;
  coveredEntryIds: string[];
  order: number;
}
