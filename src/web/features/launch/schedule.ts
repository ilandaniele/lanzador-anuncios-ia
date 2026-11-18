const pad = (value: number) => String(value).padStart(2, "0");

export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
