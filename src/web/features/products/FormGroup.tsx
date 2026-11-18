import type { ReactNode } from "react";

type FormGroupProps = { legend: string; children: ReactNode };

export function FormGroup({ legend, children }: FormGroupProps) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-rule pt-4">
      <legend className="px-1 text-lg font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}
