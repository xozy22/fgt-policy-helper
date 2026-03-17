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
}

const TOKEN_REGEX = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

function parseLogLine(line: string): RawLogEntry | null | 'skip' {
  if (!line.trim()) return 'skip';

  const fields: Record<string, string> = {};
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    fields[match[1]!] = stripQuotes(match[2]!);
  }

  // Only process traffic forward entries
  if (fields['type'] !== 'traffic') return 'skip';
  if (fields['subtype'] !== 'forward' && fields['subtype'] !== 'local') return 'skip';

  const required = ['srcip', 'srcport', 'srcintf', 'dstip', 'dstport', 'dstintf', 'proto'];
  for (const key of required) {
    if (!fields[key]) return null;
  }

  return {
    date: fields['date'],
    time: fields['time'],
    srcip: fields['srcip']!,
    srcport: parseInt(fields['srcport']!, 10),
    srcintf: fields['srcintf']!,
    dstip: fields['dstip']!,
    dstport: parseInt(fields['dstport']!, 10),
    dstintf: fields['dstintf']!,
    proto: parseInt(fields['proto']!, 10),
    action: fields['action'] ?? 'unknown',
    policyid: fields['policyid'] ? parseInt(fields['policyid'], 10) : undefined,
    sessionid: fields['sessionid'] ? parseInt(fields['sessionid'], 10) : undefined,
    srccountry: fields['srccountry'],
    dstcountry: fields['dstcountry'],
  };
}

export function parseLog(rawText: string): ParseResult {
  const lines = rawText.split(/\r?\n/);
  const entries: RawLogEntry[] = [];
  let skippedLines = 0;
  let errorLines = 0;

  for (const line of lines) {
    if (!line.trim()) {
      skippedLines++;
      continue;
    }

    const result = parseLogLine(line);
    if (result === 'skip') {
      skippedLines++;
    } else if (result === null) {
      errorLines++;
    } else {
      entries.push(result);
    }
  }

  return {
    entries,
    totalLines: lines.length,
    skippedLines,
    errorLines,
  };
}
