import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Panel({
  children,
  className,
  testid,
}: {
  children: ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className={cn(
        "rounded-xl border border-[#223142] bg-[#131B24] p-5 transition-colors duration-150 hover:border-[#334155]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
  testid,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  testid?: string;
}) {
  return (
    <Panel testid={testid} className="rise">
      <div className="label-xs">{label}</div>
      <div
        className="num mt-2 text-2xl font-semibold sm:text-3xl"
        style={accent ? { color: accent } : undefined}
        data-testid={testid ? `${testid}-value` : undefined}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </Panel>
  );
}

export function Empty({ text, testid }: { text: string; testid?: string }) {
  return (
    <div
      data-testid={testid}
      className="rounded-xl border border-dashed border-[#223142] px-6 py-12 text-center text-sm text-slate-500"
    >
      {text}
    </div>
  );
}
