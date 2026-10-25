const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export function formatPhp(centavos: number) { return php.format(centavos / 100); }
export function pesoInput(centavos: number) { return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`; }

// Parse decimal text directly to integer centavos. Never multiply a floating-point peso value.
export function parsePesos(value: string) {
  if (value.trim() !== value || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [pesos, cents = ""] = value.split(".");
  const amount = Number(pesos) * 100 + Number(cents.padEnd(2, "0"));
  return amount > 0 && amount <= 2_147_483_647 ? amount : null;
}
