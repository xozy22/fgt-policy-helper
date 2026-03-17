import type { AddressObject, AddressGroup, ServiceObject, FirewallPolicy } from '../types/policy';

function generateAddressBlock(objects: AddressObject[]): string {
  if (objects.length === 0) return '';
  const lines: string[] = ['config firewall address'];
  for (const obj of objects) {
    lines.push(`    edit "${obj.name}"`);
    switch (obj.type) {
      case 'host':
        lines.push(`        set type ipmask`);
        lines.push(`        set subnet ${obj.ip} 255.255.255.255`);
        break;
      case 'subnet': {
        const mask = obj.mask ?? '255.255.255.0';
        lines.push(`        set type ipmask`);
        lines.push(`        set subnet ${obj.ip} ${mask}`);
        break;
      }
      case 'range':
        lines.push(`        set type iprange`);
        lines.push(`        set start-ip ${obj.ip}`);
        lines.push(`        set end-ip ${obj.endIp ?? obj.ip}`);
        break;
    }
    lines.push(`    next`);
  }
  lines.push('end');
  return lines.join('\n');
}

function generateAddressGroupBlock(groups: AddressGroup[]): string {
  if (groups.length === 0) return '';
  const lines: string[] = ['config firewall addrgrp'];
  for (const grp of groups) {
    lines.push(`    edit "${grp.name}"`);
    lines.push(`        set member ${grp.members.map(m => `"${m}"`).join(' ')}`);
    if (grp.comment) lines.push(`        set comment "${grp.comment}"`);
    lines.push(`    next`);
  }
  lines.push('end');
  return lines.join('\n');
}

function generateServiceBlock(services: ServiceObject[]): string {
  if (services.length === 0) return '';
  const lines: string[] = ['config firewall service custom'];
  for (const svc of services) {
    lines.push(`    edit "${svc.name}"`);
    switch (svc.protocol) {
      case 'TCP':
        lines.push(`        set protocol TCP/UDP/SCTP`);
        if (svc.portRange) lines.push(`        set tcp-portrange ${svc.portRange}`);
        break;
      case 'UDP':
        lines.push(`        set protocol TCP/UDP/SCTP`);
        if (svc.portRange) lines.push(`        set udp-portrange ${svc.portRange}`);
        break;
      case 'ICMP':
        lines.push(`        set protocol ICMP`);
        break;
      case 'ANY':
        lines.push(`        set protocol ALL`);
        break;
    }
    lines.push(`    next`);
  }
  lines.push('end');
  return lines.join('\n');
}

function generatePolicyBlock(policies: FirewallPolicy[]): string {
  if (policies.length === 0) return '';
  const lines: string[] = ['config firewall policy'];
  for (const pol of policies) {
    const services = pol.service.length === 0 ? ['ALL'] : pol.service;
    lines.push(`    edit 0`);
    lines.push(`        set name "${pol.name}"`);
    if (pol.comment) lines.push(`        set comments "${pol.comment}"`);
    lines.push(`        set srcintf "${pol.srcintf}"`);
    lines.push(`        set dstintf "${pol.dstintf}"`);
    lines.push(`        set srcaddr "${pol.srcaddr}"`);
    lines.push(`        set dstaddr "${pol.dstaddr}"`);
    lines.push(`        set service ${services.map(s => `"${s}"`).join(' ')}`);
    lines.push(`        set action ${pol.action}`);
    lines.push(`        set schedule "${pol.schedule}"`);
    lines.push(`        set logtraffic ${pol.logtraffic}`);
    lines.push(`    next`);
  }
  lines.push('end');
  return lines.join('\n');
}

export function generateCliScript(
  policies: FirewallPolicy[],
  addressObjects: AddressObject[],
  addressGroups: AddressGroup[],
  serviceObjects: ServiceObject[],
): string {
  const sortedPolicies = [...policies].sort((a, b) => a.order - b.order);

  // Only emit service objects actually referenced by a policy
  const usedSvcNames = new Set<string>();
  for (const pol of sortedPolicies) {
    for (const s of pol.service) {
      if (s !== 'ALL') usedSvcNames.add(s);
    }
  }
  const usedSvcs = serviceObjects.filter(s => usedSvcNames.has(s.name));

  const sections: string[] = [];

  // Always emit all address objects and groups
  const addrBlock = generateAddressBlock(addressObjects);
  if (addrBlock) sections.push(addrBlock);

  const grpBlock = generateAddressGroupBlock(addressGroups);
  if (grpBlock) sections.push(grpBlock);

  const svcBlock = generateServiceBlock(usedSvcs);
  if (svcBlock) sections.push(svcBlock);

  const polBlock = generatePolicyBlock(sortedPolicies);
  if (polBlock) sections.push(polBlock);

  return sections.join('\n\n');
}
