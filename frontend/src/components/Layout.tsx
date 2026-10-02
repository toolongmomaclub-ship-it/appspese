import { NavLink, useLocation } from "react-router-dom";
import { Plus, List, Gauge, Fuel, Upload, BarChart3, Tags, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Nuova", full: "Nuova Spesa", icon: Plus, testid: "nav-home" },
  { to: "/spese", label: "Registro", full: "Registro Spese", icon: List, testid: "nav-expenses" },
  { to: "/km", label: "Km", full: "Km & Auto", icon: Gauge, testid: "nav-km" },
  { to: "/carburante", label: "Carb.", full: "Carburante", icon: Fuel, testid: "nav-fuel" },
  { to: "/analisi", label: "Analisi", full: "Analisi & Trend", icon: BarChart3, testid: "nav-analytics" },
  { to: "/categorie", label: "Cat.", full: "Categorie", icon: Tags, testid: "nav-categories" },
  { to: "/budget", label: "Budget", full: "Budget Mensile", icon: Wallet, testid: "nav-budget" },
  { to: "/importa", label: "Importa", full: "Importa Testo", icon: Upload, testid: "nav-import" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 h-16 border-b border-[#1E293B] bg-[#0B0F14]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          <NavLink to="/" data-testid="brand-link" className="flex items-baseline gap-2">
            <span className="font-heading text-lg font-extrabold tracking-tight">SPESE</span>
            <span className="num text-xs text-sky-400">tracker</span>
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={n.testid}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-[#223142] text-white"
                      : "text-slate-400 hover:bg-[#1A2532] hover:text-slate-100",
                  )
                }
              >
                {n.full}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-12">{children}</main>

      <nav
        data-testid="mobile-nav"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-8 border-t border-[#1E293B] bg-[#0E151D]/95 backdrop-blur-lg md:hidden"
      >
        {NAV.map((n) => {
          const active = pathname === n.to;
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`${n.testid}-mobile`}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors duration-150",
                active ? "text-sky-400" : "text-slate-500",
              )}
            >
              <Icon className="size-5" />
              {n.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
