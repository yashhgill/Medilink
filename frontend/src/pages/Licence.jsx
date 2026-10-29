import React, { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { PRODUCT } from "@/brand";

// About Pulih: version, where it runs, and the licence terms in plain words.
export default function Licence() {
  const [info, setInfo] = useState(null);
  useEffect(() => { api.get("/").then((r) => setInfo(r.data)).catch(() => setInfo({})); }, []);

  const rows = [
    ["Version", PRODUCT.version],
    ["Clinic", info?.facility || "…"],
    ["Mode", info?.deployment_mode === "networked" ? "Connected to the cloud" : info ? "This computer only" : "…"],
    ["Server", info?.version || "…"],
  ];

  return (
    <AppShell title={`About ${PRODUCT.name}`} subtitle="Version and licence">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-w-5xl">
        <section className="rounded-2xl border border-[#DAE2DF] bg-white p-6">
          <div className="flex items-center gap-3">
            <img src={PRODUCT.logo} alt="" className="w-12 h-12 rounded-xl" />
            <div>
              <div className="font-display text-2xl text-[#10201D]">{PRODUCT.name}</div>
              <div className="text-[14px] text-[#566663]">Clinic software that runs on this computer</div>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-[#E8EEEC]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2.5 text-[15px]">
                <dt className="text-[#566663]">{k}</dt>
                <dd className="font-semibold text-[#10201D] tabular-nums" data-testid={`about-${k.toLowerCase()}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] text-[#566663]">
            Versions are written as year, month and day, and day of the week: {PRODUCT.version} is Thursday 29 October 2026.
          </p>
        </section>

        <section className="rounded-2xl border border-[#DAE2DF] bg-white p-6 text-[15px] leading-relaxed">
          <h2 className="font-display text-xl text-[#10201D]">Licence</h2>
          <p className="mt-3">© 2026 {PRODUCT.owner}. All rights reserved.</p>
          <p className="mt-3 text-[#566663]">
            {PRODUCT.name} is proprietary software. This clinic may use it under the terms agreed in writing,
            for the period agreed. It may not be copied, changed, resold or given to another clinic.
          </p>
          <p className="mt-3 text-[#566663]">
            Patient records belong to the clinic and stay on this computer. Cloud backup, when switched on,
            keeps a copy that only this clinic can reach.
          </p>
          <p className="mt-3 text-[#566663]">Questions: hello@harnova.my</p>
        </section>
      </div>
    </AppShell>
  );
}
