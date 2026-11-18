export type NameValues = {
  producto: string;
  fecha: string;
  hora: string;
  n: number;
};

const PLACEHOLDER = /\{(\w+)\}/g;

export const renderNameTemplate = (template: string, values: NameValues) =>
  template.replace(PLACEHOLDER, (placeholder, key: string) =>
    Object.hasOwn(values, key)
      ? String(values[key as keyof NameValues])
      : placeholder,
  );

export function nameValuesAt(
  at: number,
  timeZone: string,
  producto: string,
  n: number,
): NameValues {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map(({ type, value }) => [type, value]),
  );
  return {
    producto,
    fecha: `${parts.day}-${parts.month}`,
    hora: `${parts.hour}:${parts.minute}`,
    n,
  };
}
