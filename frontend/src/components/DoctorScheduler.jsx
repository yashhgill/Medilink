import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import {
  Calendar as CalIcon,
  CaretLeft,
  CaretRight,
  X as Xicon,
  Plus,
  WaveTriangle,
  Pulse,
  ShieldSlash,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_STYLE = {
  scheduled: { bg: "#0A6E62", fg: "#0A6E62" },
  checked_in: { bg: "#0A6E62", fg: "#EEF2F1" },
  in_progress: { bg: "#10262E", fg: "#EEF2F1" },
  completed: { bg: "#0A6E62", fg: "#EEF2F1" },
  ready_for_pharmacy: { bg: "#10201D", fg: "#EEF2F1" },
  dispensed: { bg: "#566663", fg: "#EEF2F1" },
  cancelled: { bg: "#9B2226", fg: "#EEF2F1" },
};

const todayYmd = () => new Date().toISOString().slice(0, 10);
const addDays = (ymd, n) => {
  const d = new Date(ymd);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Drag-and-drop day scheduler for a doctor.
 * - Loads the doctor's slots for a date from /api/availability/{id}/slots
 * - Loads the doctor's appointments for that date
 * - Renders a vertical column of slots; drag an appointment block to a different slot to reschedule
 * - "+" on a slot creates a block (PATCH appointment is not used; we use POST /appointments/block)
 */
export default function DoctorScheduler({ doctorId }) {
  const [date, setDate] = useState(todayYmd());
  const [slots, setSlots] = useState([]);
  const [appts, setAppts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dragId, setDragId] = useState(null);

  const load = async () => {
    if (!doctorId) return;
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        api.get(`/availability/${doctorId}/slots`, { params: { date } }),
        api.get("/appointments"),
      ]);
      setSlots(s.data.slots || []);
      const list = (a.data || [])
        .filter((x) => x.doctor_id === doctorId && (x.scheduled_at || "").startsWith(date))
        .filter((x) => x.is_block || x.status !== "cancelled");
      setAppts(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [doctorId, date]);

  const apptBySlot = useMemo(() => {
    const map = {};
    for (const a of appts) {
      const key = (a.scheduled_at || "").slice(11, 16); // HH:MM
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [appts]);

  const moveAppointment = async (appt, newSlot) => {
    if (!appt) return;
    const newIso = new Date(`${date}T${newSlot.time}:00.000Z`).toISOString();
    try {
      await api.patch(`/appointments/${appt.id}`, { scheduled_at: newIso });
      toast.success(`Moved #${appt.queue_number} → ${newSlot.time}`);
      load();
    } catch (e) {
      toast.error("Move failed");
    }
  };

  const blockSlot = async (slot) => {
    const iso = new Date(`${date}T${slot.time}:00.000Z`).toISOString();
    try {
      await api.post("/appointments/block", {
        scheduled_at: iso,
        reason: "Blocked",
        duration_minutes: 30,
      });
      toast.success(`Blocked ${slot.time}`);
      load();
    } catch (e) {
      toast.error("Could not block slot");
    }
  };

  const unblock = async (a) => {
    try {
      await api.delete(`/appointments/${a.id}`);
      load();
    } catch (e) {
      toast.error("Could not remove block");
    }
  };

  return (
    <div className="rounded-2xl border border-[#DAE2DF] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="overline">Schedule</div>
          <h3 className="font-display text-xl mt-1 flex items-center gap-2">
            <CalIcon size={18} weight="duotone" color="#0A6E62" /> Day planner · drag to reschedule
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            data-testid="sched-prev"
            onClick={() => setDate(addDays(date, -1))}
            className="text-[var(--ml-primary)] hover:bg-[var(--ml-wash)] rounded-full"
          >
            <CaretLeft size={16} />
          </Button>
          <Input
            type="date"
            data-testid="sched-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="font-mono border-[#DAE2DF] h-9 w-40"
          />
          <Button
            size="icon"
            variant="ghost"
            data-testid="sched-next"
            onClick={() => setDate(addDays(date, 1))}
            className="text-[var(--ml-primary)] hover:bg-[var(--ml-wash)] rounded-full"
          >
            <CaretRight size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-2 max-h-[460px] overflow-y-auto pr-1">
        {loading && <div className="col-span-2 text-sm text-[#566663]">Loading…</div>}
        {!loading && slots.length === 0 && (
          <div className="col-span-2 rounded-xl bg-[var(--ml-wash)] border border-[#DAE2DF] p-5 text-sm text-[#566663]">
            No working hours configured for this day. Update availability above to start scheduling.
          </div>
        )}
        {!loading && slots.map((s) => {
          const items = apptBySlot[s.time] || [];
          return (
            <React.Fragment key={s.time}>
              <div className="text-[11px] font-mono text-[#566663] pt-2 sticky left-0">
                {s.time}
              </div>
              <SlotCell
                slot={s}
                items={items}
                dragId={dragId}
                onDragStart={setDragId}
                onDrop={(apptId) => {
                  const appt = appts.find((a) => a.id === apptId);
                  if (appt) moveAppointment(appt, s);
                }}
                onBlock={() => blockSlot(s)}
                onUnblock={unblock}
              />
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-4 text-[11px] text-[#566663] flex-wrap">
        <span className="inline-flex items-center gap-1"><WaveTriangle size={12} weight="duotone" /> Drag a block to move it</span>
        <span className="inline-flex items-center gap-1"><ShieldSlash size={12} /> + on an empty slot blocks the time</span>
        <span className="inline-flex items-center gap-1"><Pulse size={12} /> Status colours match dashboards</span>
      </div>
    </div>
  );
}

function SlotCell({ slot, items, dragId, onDragStart, onDrop, onBlock, onUnblock }) {
  const [hovering, setHovering] = useState(false);
  const onOver = (e) => {
    e.preventDefault();
    setHovering(true);
  };
  const onLeave = () => setHovering(false);
  const onDropEv = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setHovering(false);
    if (id) onDrop(id);
  };

  const empty = items.length === 0;
  return (
    <div
      onDragOver={onOver}
      onDragLeave={onLeave}
      onDrop={onDropEv}
      data-testid={`sched-slot-${slot.time}`}
      className={`min-h-[44px] rounded-lg border ${
        hovering ? "border-[var(--ml-primary)] bg-[var(--ml-wash)]" : "border-dashed border-[#DAE2DF] bg-[#EEF2F1]"
      } p-1.5 flex flex-wrap gap-1.5 items-center transition-colors`}
    >
      {items.map((a) => (
        <ApptBlock key={a.id} a={a} dragging={dragId === a.id} onDragStart={() => onDragStart(a.id)} onDragEnd={() => onDragStart(null)} onUnblock={onUnblock} />
      ))}
      {empty && (
        <button
          type="button"
          onClick={onBlock}
          data-testid={`sched-block-${slot.time}`}
          className="ml-auto text-[10px] text-[#566663] hover:text-[var(--ml-primary)] flex items-center gap-1 font-mono"
        >
          <Plus size={11} /> block
        </button>
      )}
    </div>
  );
}

function ApptBlock({ a, dragging, onDragStart, onDragEnd, onUnblock }) {
  const isBlock = !!a.is_block;
  const st = STATUS_STYLE[a.status] || STATUS_STYLE.scheduled;
  return (
    <motion.div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", a.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      whileTap={{ scale: 0.97 }}
      data-testid={`sched-appt-${a.id}`}
      style={{
        backgroundColor: isBlock ? "#566663" : st.bg,
        color: isBlock ? "#EEF2F1" : st.fg,
        opacity: dragging ? 0.55 : 1,
      }}
      className="cursor-grab active:cursor-grabbing rounded-md px-2 py-1 text-[11px] font-medium flex items-center gap-1.5 max-w-full"
    >
      {isBlock ? (
        <>
          <ShieldSlash size={11} />
          <span>Blocked</span>
          <button
            onClick={(e) => { e.stopPropagation(); onUnblock(a); }}
            className="ml-1 hover:opacity-70"
            data-testid={`sched-unblock-${a.id}`}
          >
            <Xicon size={11} />
          </button>
        </>
      ) : (
        <>
          <span className="font-mono">#{a.queue_number}</span>
          <span className="truncate max-w-[160px]">
            {a.patient?.name || "Patient"} · {a.reason}
          </span>
        </>
      )}
    </motion.div>
  );
}
