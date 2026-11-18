import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MoneyInput } from "../../../src/web/components/MoneyInput";
import { Select } from "../../../src/web/components/Select";
import { Input, Textarea } from "../../../src/web/components/TextField";

afterEach(cleanup);

describe("Field via Input", () => {
  it("labels the control and marks it as obligatorio", () => {
    render(<Input label="Nombre" required />);

    const input = screen.getByLabelText(/Nombre/);
    expect(screen.getByText("(obligatorio)")).toBeTruthy();
    expect(input.getAttribute("aria-required")).toBe("true");
  });

  it("links hint and error with aria-describedby and flags invalid", () => {
    render(<Input label="Precio" hint="Sin impuestos" error="Es requerido" />);

    const input = screen.getByRole("textbox", { name: "Precio" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ").length).toBe(2);
    expect(
      screen.getByRole("textbox", {
        name: "Precio",
        description: /Sin impuestos.*Es requerido/,
      }),
    ).toBeTruthy();
  });

  it("is not invalid without error", () => {
    render(<Input label="Precio" />);

    const input = screen.getByRole("textbox", { name: "Precio" });
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });
});

describe("counter", () => {
  function Counted({ limit, text }: { limit: number; text: string }) {
    return <Textarea label="Titular" limit={limit} value={text} readOnly />;
  }

  it("shows n / limit and stays neutral below 90%", () => {
    render(<Counted limit={10} text="abcde" />);

    expect(screen.getByTestId("counter").textContent).toBe("5 / 10");
    expect(screen.getByTestId("counter").className).toContain(
      "text-ink-subtle",
    );
  });

  it("turns warn at 90% of the limit", () => {
    render(<Counted limit={10} text="abcdefghi" />);

    expect(screen.getByTestId("counter").className).toContain("text-warn");
  });

  it("turns loss above the limit with a text cue and does not block typing", () => {
    function Typing() {
      const [text, setText] = useState("");
      return (
        <Input
          label="Titular"
          limit={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      );
    }
    render(<Typing />);

    const input = screen.getByRole("textbox", { name: "Titular" });
    fireEvent.change(input, { target: { value: "abcd" } });

    const counter = screen.getByTestId("counter");
    expect(counter.className).toContain("text-loss");
    expect(counter.textContent).toContain("Superaste el límite recomendado");
    expect((input as HTMLInputElement).value).toBe("abcd");
  });
});

describe("Select", () => {
  it("renders a labelled native select with options", () => {
    render(
      <Select
        label="Moneda"
        options={[
          { value: "USD", label: "Dólar" },
          { value: "ARS", label: "Peso" },
        ]}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Moneda" })).toBeTruthy();
    expect(screen.getAllByRole("option").length).toBe(2);
  });
});

describe("MoneyInput", () => {
  function Controlled({ initial }: { initial: number | null }) {
    const [value, setValue] = useState(initial);
    return (
      <>
        <MoneyInput label="Precio" value={value} onChange={setValue} />
        <output data-testid="minor">{String(value)}</output>
      </>
    );
  }

  it("reports minor units from comma decimal input", () => {
    render(<Controlled initial={null} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Precio" }), {
      target: { value: "156,5" },
    });

    expect(screen.getByTestId("minor").textContent).toBe("15650");
  });

  it("shows the fixed currency prefix and formats on blur", () => {
    render(<Controlled initial={15000} />);

    const input = screen.getByRole("textbox", { name: "Precio" });
    expect((input as HTMLInputElement).value).toBe("150,00");
    expect(screen.getByText("US$")).toBeTruthy();

    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("99,00");
  });

  it("reports null when emptied", () => {
    render(<Controlled initial={100} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Precio" }), {
      target: { value: "" },
    });

    expect(screen.getByTestId("minor").textContent).toBe("null");
  });
});
