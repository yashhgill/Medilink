# MediLink — AI Triage Methodology

## Basis: the Manchester Triage System (MTS)

Malaysian emergency departments operate zone-based triage derived from MTS.
MediLink implements the five-category MTS scale, surfaced to patients as the
familiar Malaysian three-zone colours:

| Category | Colour | Target wait |
|---|---|---|
| Immediate | Red | 0 min |
| Very Urgent | Orange | 10 min |
| Urgent | Yellow | 60 min |
| Standard | Green | 120 min |
| Non-Urgent | Blue | 240 min |

## Capture at the kiosk

During self check-in the patient describes symptoms in free text ("how are you
feeling?") and taps a 0–10 pain score. No clinical vocabulary is required —
the model reads plain Malaysian English/Malay descriptions.

## Classification

The complaint, pain score and demographics are sent to Llama 3.3 70B (Groq)
under a strict MTS system prompt that:

- outputs machine-validated JSON only (category, colour, target wait, red flags,
  reasoning);
- escalates on self-reported red-flag phrases (chest pain, breathlessness,
  severe bleeding, stroke signs, loss of consciousness);
- is instructed to over-triage rather than under-triage when uncertain — the
  clinically safer error direction.

## Fail-safe design (the examiner question)

If the AI is unreachable, times out, or returns unparseable output, the patient
is assigned **Green** and the queue falls back to arrival order — which is
exactly how walk-in clinics operate today. The triage system can fail without
the clinic failing. AI output never blocks check-in.

## Effect on the queue

The doctor's queue orders by zone priority (Red → Orange/Yellow → Green/Blue)
then arrival within a zone. The zone is printed on the patient's ticket with an
honest wait expectation, and shown as a colour badge beside each waiting patient
on the doctor's dashboard.

## Governance

Triage output is decision support, not diagnosis: the AI gateway enforces
no-diagnosis/no-prescribing rules on every call, and the treating clinician
always sees the raw complaint text alongside the AI's zone and reasoning.
