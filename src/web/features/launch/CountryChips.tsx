import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { RemovableChip } from "../../components/Chip";
import { Input } from "../../components/TextField";
import { t } from "../../i18n/es-AR";

const COUNTRY_CODE = /^[A-Z]{2}$/;
const COUNTRIES_MAX = 50;

type CountryChipsProps = {
  countries: string[];
  onChange: (countries: string[]) => void;
};

export function CountryChips({ countries, onChange }: CountryChipsProps) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  function add(event: FormEvent) {
    event.preventDefault();
    const code = text.trim().toUpperCase();
    const valid = COUNTRY_CODE.test(code) && countries.length < COUNTRIES_MAX;
    setInvalid(!valid);
    if (!valid) return;
    if (!countries.includes(code)) onChange([...countries, code]);
    setText("");
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">
        {t("launcher.step5.countriesLegend")}
      </legend>
      <ul className="flex flex-wrap gap-2">
        {countries.map((code) => (
          <li key={code}>
            <RemovableChip
              label={code}
              onRemove={() => onChange(countries.filter((c) => c !== code))}
            />
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={t("launcher.step5.countryLabel")}
            value={text}
            maxLength={2}
            autoComplete="off"
            error={invalid ? t("launcher.step5.countryInvalid") : undefined}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          {t("launcher.step5.countryAdd")}
        </Button>
      </form>
    </fieldset>
  );
}
