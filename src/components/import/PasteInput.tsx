import { useState } from 'react';

interface Props {
  onText: (text: string) => void;
}

const PLACEHOLDER = `date=2026-01-30 time=09:25:47 eventtime=1769761547195863779 tz="+0100" logid="0000000020" type="traffic" subtype="forward" level="notice" vd="root" srcip=192.168.11.100 srcport=1029 srcintf="Solar_Net_SSW" srcintfrole="lan" dstip=47.236.122.140 dstport=1883 dstintf="Telekom-GF" dstintfrole="wan" srccountry="Reserved" dstcountry="Singapore" sessionid=1169 proto=6 action="accept" policyid=26 policytype="policy" poluuid="421515d0-5017-51f0-646b-d496a6a92146"`;

export function PasteInput({ onText }: Props) {
  const [value, setValue] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={PLACEHOLDER}
        className="w-full h-48 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 resize-none"
        spellCheck={false}
      />
      <button
        onClick={() => value.trim() && onText(value)}
        disabled={!value.trim()}
        className="self-end px-5 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        Parse Log
      </button>
    </div>
  );
}
