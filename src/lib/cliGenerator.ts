import type { AddressObject, AddressGroup, ServiceObject, FirewallPolicy } from '../types/policy';
import type { FortiosVersion } from '../store/useAppStore';

/** Escape backslashes and double-quotes for FortiGate CLI strings. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function generateAddressBlock(objects: AddressObject[]): string {
  if (objects.length === 0) return '';
  const lines: string[] = ['config firewall address'];
  for (const obj of objects) {
    lines.push(`    edit "${esc(obj.name)}"`);
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
    lines.push(`    edit "${esc(grp.name)}"`);
    lines.push(`        set member ${grp.members.map(m => `"${esc(m)}"`).join(' ')}`);
    if (grp.comment) lines.push(`        set comment "${esc(grp.comment)}"`);
    lines.push(`    next`);
  }
  lines.push('end');
  return lines.join('\n');
}

/**
 * FortiOS version differences for `config firewall service custom`:
 *
 *  7.4: set protocol TCP/UDP/SCTP          (no UDP-Lite; default value)
 *  7.6: set protocol TCP/UDP/UDP-Lite/SCTP (UDP-Lite added; default value)
 *
 * Services with protocol=ANY map to the built-in FortiGate "ALL" service
 * and must NOT generate a `config firewall service custom` entry —
 * the `ALL` protocol option in that stanza is reserved for web-proxy use only.
 */
function protoIdentifier(version: FortiosVersion): string {
  return version === '7.6' ? 'TCP/UDP/UDP-Lite/SCTP' : 'TCP/UDP/SCTP';
}

function generateServiceBlock(services: ServiceObject[], version: FortiosVersion): string {
  const custom = services.filter(s => s.protocol !== 'ANY');
  if (custom.length === 0) return '';
  const proto = protoIdentifier(version);
  const lines: string[] = ['config firewall service custom'];
  for (const svc of custom) {
    lines.push(`    edit "${esc(svc.name)}"`);
    switch (svc.protocol) {
      case 'TCP':
        lines.push(`        set protocol ${proto}`);
        if (svc.portRange) lines.push(`        set tcp-portrange ${svc.portRange}`);
        break;
      case 'UDP':
        lines.push(`        set protocol ${proto}`);
        if (svc.portRange) lines.push(`        set udp-portrange ${svc.portRange}`);
        break;
      case 'ICMP':
        lines.push(`        set protocol ICMP`);
        break;
    }
    lines.push(`    next`);
  }
  lines.push('end');
  return lines.join('\n');
}

function generatePolicyBlock(policies: FirewallPolicy[], anyServiceNames: Set<string>): string {
  if (policies.length === 0) return '';
  const lines: string[] = ['config firewall policy'];
  for (const pol of policies) {
    // Replace names that came from ANY-typed service objects with the
    // built-in FortiGate "ALL" service (custom ANY entries are not generated).
    const resolvedServices = pol.service.map(s => anyServiceNames.has(s) ? 'ALL' : s);
    // Deduplicate in case multiple ANY services collapse into "ALL"
    const seen = new Set<string>();
    const services = (resolvedServices.length === 0 ? ['ALL'] : resolvedServices)
      .filter(s => { if (seen.has(s)) return false; seen.add(s); return true; });
    lines.push(`    edit 0`);
    lines.push(`        set name "${esc(pol.name)}"`);
    if (pol.comment) lines.push(`        set comments "${esc(pol.comment)}"`);
    lines.push(`        set srcintf "${esc(pol.srcintf)}"`);
    lines.push(`        set dstintf "${esc(pol.dstintf)}"`);
    lines.push(`        set srcaddr "${esc(pol.srcaddr)}"`);
    lines.push(`        set dstaddr "${esc(pol.dstaddr)}"`);
    lines.push(`        set service ${services.map(s => `"${esc(s)}"`).join(' ')}`);
    lines.push(`        set action ${pol.action}`);
    lines.push(`        set schedule "${esc(pol.schedule)}"`);
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
  version: FortiosVersion = '7.6',
): string {
  const sortedPolicies = [...policies].sort((a, b) => a.order - b.order);

  // Collect names of ANY-typed services so the policy block can substitute "ALL"
  const anyServiceNames = new Set<string>(
    serviceObjects.filter(s => s.protocol === 'ANY').map(s => s.name),
  );

  // Only emit custom service objects actually referenced by a policy (excludes ANY)
  const usedSvcNames = new Set<string>();
  for (const pol of sortedPolicies) {
    for (const s of pol.service) {
      if (s !== 'ALL') usedSvcNames.add(s);
    }
  }
  const usedSvcs = serviceObjects.filter(s => usedSvcNames.has(s.name) && s.protocol !== 'ANY');

  const sections: string[] = [];

  // Always emit all address objects and groups
  const addrBlock = generateAddressBlock(addressObjects);
  if (addrBlock) sections.push(addrBlock);

  const grpBlock = generateAddressGroupBlock(addressGroups);
  if (grpBlock) sections.push(grpBlock);

  const svcBlock = generateServiceBlock(usedSvcs, version);
  if (svcBlock) sections.push(svcBlock);

  const polBlock = generatePolicyBlock(sortedPolicies, anyServiceNames);
  if (polBlock) sections.push(polBlock);

  return sections.join('\n\n');
}
