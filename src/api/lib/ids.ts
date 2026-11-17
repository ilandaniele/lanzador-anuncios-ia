import { bytesToHex } from "./hash";
import { now } from "./time";

const SEQUENCE_MAX = 0xfff;

let lastTimestamp = 0;
let sequence = 0;

function nextTimestampAndSequence(): { timestamp: number; sequence: number } {
  const clock = now();
  if (clock > lastTimestamp) {
    lastTimestamp = clock;
    sequence = 0;
  } else if (sequence < SEQUENCE_MAX) {
    sequence++;
  } else {
    lastTimestamp++;
    sequence = 0;
  }
  return { timestamp: lastTimestamp, sequence };
}

function formatUuid(hex: string): string {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function newId(): string {
  const { timestamp, sequence: counter } = nextTimestampAndSequence();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes.subarray(8));

  let remaining = timestamp;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  return formatUuid(bytesToHex(bytes));
}
