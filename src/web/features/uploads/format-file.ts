const BYTES_PER_MB = 1024 * 1024;
const NAME_MAX_LENGTH = 36;

const megabytes = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export const formatMegabytes = (bytes: number) =>
  `${megabytes.format(bytes / BYTES_PER_MB)} MB`;

export function truncateMiddle(name: string, max = NAME_MAX_LENGTH) {
  if (name.length <= max) return name;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return `${name.slice(0, head)}…${name.slice(name.length - (keep - head))}`;
}
