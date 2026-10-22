import AppShell from "@/components/AppShell";
import { PRODUCT } from "@/brand";

export default function Licence() {
  return (
    <AppShell title="Licence">
      <div className="p-8 text-center text-[#566663]">
        <h2 className="font-display text-2xl text-[var(--ml-primary-soft)] mb-2">Licence</h2>
        <p>{PRODUCT.name} — standalone demo licence. All features enabled for presentation.</p>
      </div>
    </AppShell>
  );
}
