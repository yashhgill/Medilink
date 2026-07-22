import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { motion } from "framer-motion";
import { Clock, CalendarBlank } from "@phosphor-icons/react";

/**
 * Pick a date (shadcn calendar) + an open time slot for a given doctor.
 * Calls onChange(isoString) when a slot is selected.
 */
export default function SlotPicker({ doctorId, value, onChange }) {
  const [date, setDate] = useState(value ? new Date(value) : new Date());
  const [slots, setSlots] = useState([]);
  const [off, setOff] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doctorId || !date) return;
    const ymd = date.toISOString().slice(0, 10);
    setLoading(true);
    api
      .get(`/availability/${doctorId}/slots`, { params: { date: ymd } })
      .then((r) => {
        setSlots(r.data.slots || []);
        setOff(!!r.data.off);
      })
      .catch(() => {
        setSlots([]);
        setOff(false);
      })
      .finally(() => setLoading(false));
  }, [doctorId, date]);

  const ymd = date.toISOString().slice(0, 10);
  const selectedTime = value && value.startsWith(ymd) ? value.slice(11, 16) : null;

  return (
    <div className="grid sm:grid-cols-[auto_1fr] gap-4">
      <div className="rounded-2xl border border-[#DCE8E9] bg-white p-3">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && setDate(d)}
          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
          data-testid="slot-calendar"
          className="rounded-md"
        />
      </div>
      <div className="rounded-2xl border border-[#DCE8E9] bg-white p-4">
        <div className="flex items-center gap-2 mb-3 text-[#0B7C8C]">
          <CalendarBlank size={16} weight="duotone" />
          <div className="text-sm font-medium">
            {date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        {!doctorId && <div className="text-sm text-[#5A6B70]">Choose a doctor first.</div>}
        {doctorId && loading && <div className="text-sm text-[#5A6B70]">Loading slots…</div>}
        {doctorId && !loading && off && (
          <div className="rounded-xl bg-[#EAF5F5] border border-[#DCE8E9] p-4 text-sm text-[#5A6B70]">
            Doctor is off this day.
          </div>
        )}
        {doctorId && !loading && !off && slots.length === 0 && (
          <div className="text-sm text-[#5A6B70]">No slots available.</div>
        )}
        {!loading && !off && slots.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto pr-1">
            {slots.map((s) => {
              const sel = selectedTime === s.time;
              return (
                <motion.button
                  key={s.iso}
                  whileTap={{ scale: 0.96 }}
                  data-testid={`slot-${s.time}`}
                  disabled={s.booked}
                  onClick={() => onChange(s.iso)}
                  className={`relative flex items-center justify-center gap-1 px-2 h-9 rounded-full border text-xs font-mono transition-colors ${
                    s.booked
                      ? "opacity-40 cursor-not-allowed border-[#DCE8E9] line-through"
                      : sel
                      ? "bg-[#0B7C8C] text-[#F4F9F9] border-[#0B7C8C]"
                      : "border-[#DCE8E9] hover:bg-[#EAF5F5]"
                  }`}
                >
                  <Clock size={11} weight="duotone" /> {s.time}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
