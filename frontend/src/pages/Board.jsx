import React from "react";
import { useNavigate } from "react-router-dom";
import { ZONE_COLOUR, useQueueBoard, useClock } from "@/components/QueueBoard";

/* Waiting-room screen. Made for a TV across the room: huge numbers, no names,
   readable from the back row. Open it full screen on any browser at /board. */
const pad = (n) => String(n ?? "").padStart(3, "0");

export default function Board() {
  const nav = useNavigate();
  const board = useQueueBoard(4000);
  const now = useClock();
  const serving = board?.now_serving || [];
  const waiting = board?.waiting || [];
  const collect = board?.collect || [];

  return (
    <div className="min-h-screen bg-[#0B1D24] text-white flex flex-col" data-testid="queue-board">
      <header className="px-8 lg:px-12 pt-8 pb-6 flex items-end justify-between gap-6 border-b border-white/10">
        <div>
          <div className="text-white/55 text-[20px]">Waiting room</div>
          <h1 className="text-white text-[40px] lg:text-[52px] leading-none mt-1">{board?.clinic_name || "Clinic"}</h1>
        </div>
        <div className="text-right">
          <div className="figure text-[56px] lg:text-[72px]">{now.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}</div>
          <div className="text-white/55 text-[18px]">{now.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
      </header>

      <main className="flex-1 grid lg:grid-cols-[1.4fr_1fr] gap-0">
        <section className="px-8 lg:px-12 py-8 border-b lg:border-b-0 lg:border-r border-white/10">
          <h2 className="text-white/70 text-[24px] font-sans font-semibold tracking-normal">Sila masuk · Please go in</h2>
          {serving.length === 0 ? (
            <p className="mt-10 text-white/45 text-[28px]">The doctors will call the next number shortly.</p>
          ) : (
            <ul className="mt-6 grid sm:grid-cols-2 gap-5">
              {serving.map((s) => (
                <li key={s.number} className="rounded-3xl bg-white/[0.06] border border-white/10 overflow-hidden">
                  <div className="h-2" style={{ background: ZONE_COLOUR[s.zone] || "#5FD3A8" }} />
                  <div className="px-7 py-6">
                    <div className="figure text-[120px] lg:text-[150px]">{pad(s.number)}</div>
                    <div className="text-white/70 text-[24px] mt-2 truncate">{s.doctor || "Consultation room"}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="px-8 lg:px-12 py-8 flex flex-col gap-10">
          <div>
            <h2 className="text-white/70 text-[24px] font-sans font-semibold tracking-normal">Menunggu · Waiting <span className="text-white/45">({waiting.length})</span></h2>
            <ul className="mt-5 flex flex-wrap gap-3">
              {waiting.slice(0, 18).map((w) => (
                <li key={w.number} className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-4 py-2.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ZONE_COLOUR[w.zone] || "#8FA3A9" }} />
                  <span className="figure text-[40px]">{pad(w.number)}</span>
                </li>
              ))}
              {waiting.length === 0 && <li className="text-white/45 text-[22px]">No one waiting</li>}
            </ul>
          </div>
          <div>
            <h2 className="text-white/70 text-[24px] font-sans font-semibold tracking-normal">Ambil ubat · Collect medicine</h2>
            <ul className="mt-5 flex flex-wrap gap-3">
              {collect.map((c) => (
                <li key={c.number} className="rounded-xl bg-[#5FD3A8] text-[#0B1D24] px-5 py-2.5 figure text-[44px]">{pad(c.number)}</li>
              ))}
              {collect.length === 0 && <li className="text-white/45 text-[22px]">Nothing ready yet</li>}
            </ul>
          </div>
        </section>
      </main>

      <footer className="px-8 lg:px-12 py-4 border-t border-white/10 flex items-center justify-between text-white/45 text-[16px]">
        <span>Urgent patients may be called first. Thank you for waiting.</span>
        <button onClick={() => nav("/")} className="hover:text-white">Exit</button>
      </footer>
    </div>
  );
}
