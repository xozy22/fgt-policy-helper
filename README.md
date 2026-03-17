# FortiGate Policy Creation Helper

A client-side web app that helps you build precise FortiGate firewall policies from traffic logs — no backend, no server, everything runs in your browser.

## The Problem

When setting up a FortiGate firewall from scratch, the typical workflow is:
1. Enable an any-any policy with logging (learning mode)
2. Let traffic flow for a while
3. Export the traffic log
4. Manually read through hundreds of log lines and hand-write CLI configs

This app automates step 4.

## Features

- **Log Import** — paste or upload a FortiGate traffic log (key=value format)
- **Automatic Deduplication** — identical flows are collapsed into one row with a hit count
- **Traffic Filtering** — filter by source/destination IP (exact, CIDR, range), port, interface, protocol, or action with combinable AND/OR logic
- **Address Objects** — select traffic entries and create host/subnet/range address objects; IPs that fall in the same subnet are automatically grouped into a single object
- **Policy Creation** — create firewall policies from selected traffic entries; interfaces, addresses and services are pre-filled automatically
- **Policy Editing** — double-click any policy in the output view to edit it
- **CLI Export** — generates a ready-to-paste FortiGate CLI script with all address objects, service objects, and policies in the correct order

## Workflow

```
Import Log → Review Traffic → Create Objects & Policies → Copy CLI Script
```

1. **Import** — paste your FortiGate log or drop a file
2. **Traffic Review** — filter and select the entries you want to cover
3. **Create Policy** — the app suggests interfaces, addresses, and services based on your selection
4. **Output** — copy the generated CLI script and paste it into your FortiGate CLI

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- @tanstack/react-virtual (virtualized table for large logs)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build

```bash
npm run build
```

The output goes to `dist/` and can be served from any static file host.

## FortiGate Log Format

The app expects standard FortiGate traffic logs in key=value format:

```
date=2024-01-15 time=10:23:45 type="traffic" subtype="forward" srcip=192.168.10.5 srcport=443 srcintf="LAN" dstip=8.8.8.8 dstport=443 dstintf="WAN" proto=6 action="accept"
```

Required fields: `srcip`, `srcport`, `srcintf`, `dstip`, `dstport`, `dstintf`, `proto`

## CLI Output Example

```
config firewall address
    edit "LAN-192.168.10.0"
        set type ipmask
        set subnet 192.168.10.0 255.255.255.0
    next
end

config firewall service custom
    edit "TCP-443"
        set protocol TCP/UDP/SCTP
        set tcp-portrange 443
    next
end

config firewall policy
    edit 0
        set name "Allow-LAN-to-WAN"
        set srcintf "LAN"
        set dstintf "WAN"
        set srcaddr "LAN-192.168.10.0"
        set dstaddr "all"
        set service "TCP-443"
        set action accept
        set schedule "always"
        set logtraffic all
    next
end
```
