import { formatCents } from "@/lib/money";

export type BarDatum = { label: string; cents: number; current?: boolean };

/** Gráfica de barras cuadradas, sin librerías. La barra actual va en verde oscuro con su valor. */
export function BarChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  return (
    <div className="bars" role="img" aria-label={ariaLabel}>
      {data.map((d) => (
        <div key={d.label} className={`bar ${d.current ? "current" : ""}`} title={`${d.label}: ${formatCents(d.cents)}`}>
          <div className="bar-fill" style={{ height: `${Math.max(1, (d.cents / max) * 100)}%` }}>
            {d.current && <span className="bar-value">{formatCents(d.cents)}</span>}
          </div>
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
