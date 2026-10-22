import React from "react";

// The Malaysian triage zones. These colours appear nowhere else in the app,
// so on any screen a red, yellow or green mark always means urgency.
// Labels follow the Manchester Triage categories the engine assigns (docs/TRIAGE.md).
export const ZONE_LABEL = {
  Red: "Red · immediate",
  Orange: "Orange · very urgent",
  Yellow: "Yellow · urgent",
  Green: "Green · standard",
  Blue: "Blue · non-urgent",
};
const ORDER = { Red: 0, Orange: 1, Yellow: 2, Green: 3, Blue: 4 };

/** Sort appointments the way the clinic sees them: most urgent first, then by
 *  queue number within a zone. Untriaged visits go last. */
export function byTriage(a, b) {
  const za = ORDER[a.triage_colour] ?? 9, zb = ORDER[b.triage_colour] ?? 9;
  return za - zb || (a.queue_number || 0) - (b.queue_number || 0);
}

export function TriageChip({ zone, short = false }) {
  if (!zone) return null;
  return (
    <span className={`triage triage-${zone}`} data-testid="triage-chip">
      {short ? zone : ZONE_LABEL[zone] || zone}
    </span>
  );
}

/** The queue ticket: the one object every patient carries through the visit. */
export function QueueTicket({ number, zone, size = "md", children }) {
  const n = number == null ? "–" : String(number).padStart(3, "0");
  return (
    <div className={`ticket ${size === "lg" ? "lg" : ""}`} data-testid="queue-ticket">
      <div className="ticket-stub" data-zone={zone || ""}>
        <div className="text-[13px] font-semibold opacity-90 mb-1">Queue no.</div>
        <div className="ticket-no">{n}</div>
      </div>
      <div className="ticket-body">{children}</div>
    </div>
  );
}
