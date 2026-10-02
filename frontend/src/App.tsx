import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";

const Home = lazy(() => import("@/pages/Home"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Km = lazy(() => import("@/pages/Km"));
const Fuel = lazy(() => import("@/pages/Fuel"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Categories = lazy(() => import("@/pages/Categories"));
const BudgetPage = lazy(() => import("@/pages/Budget"));
const ImportPage = lazy(() => import("@/pages/Import"));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" data-testid="page-fallback">
      <div className="size-8 animate-spin rounded-full border-2 border-[#223142] border-t-sky-500" />
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/spese" element={<Expenses />} />
          <Route path="/km" element={<Km />} />
          <Route path="/carburante" element={<Fuel />} />
          <Route path="/analisi" element={<Analytics />} />
          <Route path="/categorie" element={<Categories />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/importa" element={<ImportPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <Toaster richColors />
    </Layout>
  );
}
