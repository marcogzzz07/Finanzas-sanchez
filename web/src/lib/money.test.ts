import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseAmount, parseBalance } from "./money";

describe("dinero en centavos", () => {
  it("convierte texto a centavos sin flotantes", () => {
    expect(parseAmount("1,234.5")).toBe(123450);
    expect(parseAmount("$ 0.10")).toBe(10);
    expect(parseAmount("0.1")).toBe(10);
    expect(parseAmount("19.99")).toBe(1999);
    expect(parseAmount("5000")).toBe(500000);
  });

  it("rechaza importes inválidos", () => {
    for (const bad of ["", "0", "-5", "1.234", "abc", "1e5", "1.2.3"]) expect(parseAmount(bad)).toBeNull();
  });

  it("los saldos admiten cero y negativos", () => {
    expect(parseBalance("0")).toBe(0);
    expect(parseBalance("-200")).toBe(-20000);
  });

  it("formatea con signo claro", () => {
    expect(formatCents(123450)).toBe("$1,234.50");
    expect(formatCents(-20000)).toBe("-$200.00");
    expect(formatCents("1500000")).toBe("$15,000.00");
    expect(formatCents(null)).toBe("—");
    expect(centsToInput(-5)).toBe("-0.05");
  });
});
