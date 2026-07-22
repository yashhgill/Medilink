import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalIcon, FloppyDisk } from "@phosphor-icons/react";
import { toast } from "sonner";

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

/**
 * Doctor-facing card to edit weekly availability.
 */
export default function AvailabilityCard({ doctorId }) {
  const [hours, setHours] = useState({});
  const [slot, setSlot] = useState(30);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!doctorId) return;
    setLoading(true);
    api
      .get(`/availability/${doctorId}`)
      .then((r) => {
        setHours(r.data.hours || {});
        setSlot(r.data.slot_minutes || 30);
      })
      .finally(() => setLoading(false));
  }, [doctorId]);

  const setDay = (key, val) => setHours((h) => ({ ...h, [key]: val }));
  const toggleOff = (key) =>
    setHours((h) => ({ ...h, [key]: h[key] ? "" : "09:00-17:00" }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/availability/me", { hours, slot_minutes: Number(slot) });
      toast.success("Availability saved");
    } catch (e) {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#DCE8E9] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="overline">Availability</div>
          <h3 className="font-display text-xl mt-1 flex items-center gap-2">
            <CalIcon size={18} weight="duotone" color="#0B7C8C" /> Weekly hours
          </h3>
        </div>
        <Button
          data-testid="availability-save"
          size="sm"
          onClick={save}
          disabled={saving || loading}
          className="bg-[#0B7C8C] hover:bg-[#075F6C] text-[#F4F9F9] rounded-full"
        >
          <FloppyDisk size={14} className="mr-1.5" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="space-y-2">
        {DAYS.map(([key, label]) => {
          const v = hours[key] || "";
          const open = !!v;
          return (
            <div key={key} data-testid={`avail-row-${key}`} className="flex items-center gap-3 p-2.5 rounded-xl border border-[#DCE8E9] bg-[#F4F9F9]">
              <div className="w-10 text-sm font-medium">{label}</div>
              <Switch
                data-testid={`avail-switch-${key}`}
                checked={open}
                onCheckedChange={() => toggleOff(key)}
              />
              {open ? (
                <Input
                  data-testid={`avail-input-${key}`}
                  value={v}
                  onChange={(e) => setDay(key, e.target.value)}
                  placeholder="09:00-17:00"
                  className="font-mono border-[#DCE8E9] h-9 flex-1"
                />
              ) : (
                <div className="text-xs text-[#5A6B70] flex-1">Day off</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <div className="text-sm text-[#5A6B70]">Slot duration</div>
        <Input
          data-testid="avail-slot-min"
          type="number"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="w-24 font-mono border-[#DCE8E9] h-9"
        />
        <div className="text-xs text-[#5A6B70]">minutes</div>
      </div>
    </div>
  );
}
