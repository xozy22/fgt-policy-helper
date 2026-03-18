export interface RawLogEntry {
  date?: string;
  time?: string;
  srcip: string;
  srcport: number;
  srcintf: string;
  dstip: string;
  dstport: number;
  dstintf: string;
  proto: number;
  action: string;
  policyid?: number;
  sessionid?: number;
  srccountry?: string;
  dstcountry?: string;
}

export interface ParseResult {
  entries: RawLogEntry[];
  totalLines: number;
  skippedLines: number;
  errorLines: number;
  /** Human-readable description of the first few failed lines. */
  errorDetails: string[];
}

const TOKEN_REGEX = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

/** Returns the entry, a skip-reason string, or an error-reason string. */
function parseLogLine(line: string): RawLogEntry | { skip: string } | { error: string } {
  if (!line.trim()) return { skip: 'empty line' };

  const fields: Record<string, string> = {};
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    fields[match[1]!] = stripQuotes(match[2]!);
  }

  // Only process traffic forward/local entries
  if (fields['type'] !== 'traffic')  return { skip: `type="${fields['type'] ?? '?'}" (not traffic)` };
  if (fields['subtype'] !== 'forward' && fields['subtype'] !== 'local')
    return { skip: `subtype="${fields['subtype'] ?? '?'}" (not forward/local)` };

  // Check required fields are present
  const required = ['srcip', 'srcport', 'srcintf', 'dstip', 'dstport', 'dstintf', 'proto'];
  for (const key of required) {
    if (!fields[key]) return { error: `missing field "${key}"` };
  }

  // Validate numeric fields
  const srcport = parseInt(fields['srcport']!, 10);
  const dstport = parseInt(fields['dstport']!, 10);
  const proto   = parseInt(fields['proto']!,   10);

  if (isNaN(srcport) || srcport < 0 || srcport > 65535)
    return { error: `invalid srcport="${fields['srcport']}"` };
  if (isNaN(dstport) || dstport < 0 || dstport > 65535)
    return { error: `invalid dstport="${fields['dstport']}"` };
  if (isNaN(proto) || proto < 0 || proto > 255)
    return { error: `invalid proto="${fields['proto']}"` };

  return {
    date:      fields['date'],
    time:      fields['time'],
    srcip:     fields['srcip']!,
    srcport,
    srcintf:   fields['srcintf']!,
    dstip:     fields['dstip']!,
    dstport,
    dstintf:   fields['dstintf']!,
    proto,
    action:    fields['action'] ?? 'unknown',
    policyid:  fields['policyid']  ? parseInt(fields['policyid'],  10) : undefined,
    sessionid: fields['sessionid'] ? parseInt(fields['sessionid'], 10) : undefined,
    srccountry: fields['srccountry'],
    dstcountry: fields['dstcountry'],
  };
}

export function parseLog(rawText: string): ParseResult {
  const lines = rawText.split(/\r?\n/);
  const entries: RawLogEntry[] = [];
  const errorDetails: string[] = [];
  let skippedLines = 0;
  let errorLines   = 0;

  lines.forEach((line, idx) => {
    if (!line.trim()) { skippedLines++; return; }

    const result = parseLogLine(line);

    if ('skip' in result) {
      skippedLines++;
    } else if ('error' in result) {
      errorLines++;
      if (errorDetails.length < 5) {
        errorDetails.push(`Line ${idx + 1}: ${result.error}`);
      }
    } else {
      entries.push(result);
    }
  });

  return { entries, totalLines: lines.length, skippedLines, errorLines, errorDetails };
}
