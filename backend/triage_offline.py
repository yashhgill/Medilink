"""
Deterministic Manchester-Triage-style assessment, with no network and no LLM.

Why this exists
---------------
AI triage is sold as a Core feature, and Core is the offline tier. Before this,
triage returned 503 without a Groq API key, which meant the advertised feature
was unavailable on exactly the clinic it was designed for: the rural one with no
internet. That is not an acceptable failure.

So triage now has two engines:

  • the LLM, when a key and a connection are both present, and
  • this, always.

This module is not trying to be clever. It encodes the discriminators that
actually drive Manchester Triage decisions: airway and breathing, circulation,
conscious level, pain severity, and a handful of red-flag presentations. It runs
in microseconds on a decade-old clinic PC.

The one rule that matters
-------------------------
This is a screening aid for a queue, not a diagnosis. Every ambiguity resolves
UPWARDS. A patient wrongly placed in Red waits less than they needed to; a
patient wrongly placed in Green may deteriorate in a waiting room. Those two
errors are not equivalent, and the code treats them accordingly:

  • unparseable or unrecognised input does NOT become Green, it becomes Yellow
  • any single red flag wins, regardless of everything else
  • the offline result is never allowed to downgrade an LLM result

Categories follow the Malaysian ED three-zone model already used elsewhere in
the app (Merah / Kuning / Hijau).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

# ── zones ────────────────────────────────────────────────────────────────────
RED = {"category": "Immediate", "colour": "Red", "zone": "MERAH", "target_wait_minutes": 0}
ORANGE = {"category": "Very urgent", "colour": "Red", "zone": "MERAH", "target_wait_minutes": 10}
YELLOW = {"category": "Urgent", "colour": "Yellow", "zone": "KUNING", "target_wait_minutes": 60}
GREEN = {"category": "Standard", "colour": "Green", "zone": "HIJAU", "target_wait_minutes": 120}

_RANK = {"Red": 3, "Yellow": 2, "Green": 1}


def _rank(colour: str) -> int:
    return _RANK.get(colour, 2)


# ── discriminators ───────────────────────────────────────────────────────────
# Ordered most severe first. Each entry: (zone, label, patterns)
# Patterns are matched against a normalised, lowercased complaint string.

_IMMEDIATE: List[Tuple[str, List[str]]] = [
    ("Airway or breathing compromise", [
        r"\bnot breathing\b", r"\bstopped breathing\b", r"\bchoking\b", r"\bcan'?t breathe\b",
        r"\bcannot breathe\b", r"\bstruggling to breathe\b", r"\bgasping\b",
        r"\btak boleh bernafas\b", r"\bsesak nafas teruk\b", r"\btercekik\b",
    ]),
    ("Cardiac arrest or collapse", [
        r"\bno pulse\b", r"\bcardiac arrest\b", r"\bcollapsed\b", r"\bunresponsive\b",
        r"\bnot responding\b", r"\bpengsan\b", r"\btidak sedar\b",
    ]),
    ("Severe haemorrhage", [
        r"\bheavy bleeding\b", r"\bbleeding heavily\b", r"\buncontrolled bleeding\b",
        r"\bspurting\b", r"\bpendarahan teruk\b",
    ]),
    ("Seizure in progress", [
        r"\bfitting\b", r"\bseizure now\b", r"\bconvulsing\b", r"\bsawan\b",
    ]),
]

_VERY_URGENT: List[Tuple[str, List[str]]] = [
    ("Possible cardiac chest pain", [
        r"\bchest pain\b", r"\bchest tightness\b", r"\bcrushing\b", r"\bpressure in (?:my )?chest\b",
        r"\bsakit dada\b", r"\bdada sakit\b",
    ]),
    ("Stroke symptoms", [
        r"\bface droop\b", r"\bslurred speech\b", r"\bweak(?:ness)? on one side\b",
        r"\bone side\b.*\bnumb\b", r"\bstroke\b", r"\bangin ahmar\b",
    ]),
    ("Shortness of breath", [
        r"\bshort(?:ness)? of breath\b", r"\bbreathless\b", r"\bdifficulty breathing\b",
        r"\bwheez", r"\bsesak\b", r"\bsukar bernafas\b",
    ]),
    ("Altered conscious level", [
        r"\bconfus", r"\bdrowsy\b", r"\bfainted\b", r"\bpassed out\b", r"\bmengantuk teruk\b",
    ]),
    ("Severe abdominal pain", [
        r"\bsevere (?:abdominal|stomach|tummy) pain\b", r"\bsakit perut teruk\b",
    ]),
    ("Anaphylaxis or severe allergy", [
        r"\banaphyla", r"\bswollen (?:lips|tongue|throat|face)\b", r"\ballergic reaction\b",
        r"\bbengkak (?:bibir|lidah|muka)\b",
    ]),
    ("Suicidal ideation or self-harm", [
        r"\bsuicid", r"\bkill myself\b", r"\bend my life\b", r"\bself[- ]harm\b",
        r"\bharm myself\b", r"\bbunuh diri\b",
    ]),
    ("Major trauma", [
        r"\broad accident\b", r"\bmotor ?(?:cycle|bike) accident\b", r"\bfell from\b",
        r"\bhead injury\b", r"\bkemalangan\b",
    ]),
    ("Obstetric emergency", [
        r"\bpregnan\w*\b.*\bbleed", r"\bbleed\w*\b.*\bpregnan", r"\blabour\b",
        r"\bwater broke\b", r"\bmengandung\b.*\bberdarah\b",
    ]),
]

_URGENT: List[Tuple[str, List[str]]] = [
    ("Fever", [r"\bfever\b", r"\bhigh temperature\b", r"\bdemam\b"]),
    ("Persistent vomiting", [r"\bvomit", r"\bthrowing up\b", r"\bmuntah\b"]),
    ("Dehydration risk", [r"\bdiarrh", r"\bcirit\b", r"\bdehydrat"]),
    ("Moderate injury", [r"\bfracture\b", r"\bbroken\b", r"\bsprain\b", r"\bswollen\b",
                         r"\bpatah\b", r"\bterseliuh\b"]),
    ("Infection signs", [r"\binfect", r"\bpus\b", r"\babscess\b", r"\bnanah\b"]),
    ("Urinary symptoms", [r"\bburning (?:when )?urinat", r"\bblood in urine\b", r"\bkencing\b"]),
    ("Asthma history", [r"\basthma\b", r"\blelah\b"]),
]

_ROUTINE: List[Tuple[str, List[str]]] = [
    ("Minor upper respiratory symptoms", [
        r"\bsore throat\b", r"\bcough\b", r"\bcold\b", r"\brunny nose\b", r"\bflu\b",
        r"\bselsema\b", r"\bbatuk\b", r"\bsakit tekak\b",
    ]),
    ("Skin complaint", [r"\brash\b", r"\bitch", r"\bgatal\b", r"\bruam\b"]),
    ("Routine review", [
        r"\bfollow[- ]?up\b", r"\brepeat prescription\b", r"\bmedical (?:check|report)\b",
        r"\bcheck ?up\b", r"\bvaccin", r"\bsuntikan\b", r"\bmc\b", r"\bsijil\b",
    ]),
    ("Minor ache", [r"\bheadache\b", r"\bbackache\b", r"\bsakit kepala\b", r"\bsakit belakang\b"]),
]


def _match(text: str, groups: List[Tuple[str, List[str]]]) -> Optional[str]:
    for label, patterns in groups:
        for p in patterns:
            if re.search(p, text):
                return label
    return None


# ── vital-sign discriminators ────────────────────────────────────────────────
def _assess_vitals(v: Optional[Dict[str, Any]]) -> Tuple[Optional[str], List[str]]:
    """Return (worst_colour, findings). Physiology outranks the free-text
    complaint: someone who says 'just a cough' with SpO2 88% is not routine."""
    if not v:
        return None, []
    findings: List[str] = []
    worst = None

    def bump(colour, msg):
        nonlocal worst
        findings.append(msg)
        if worst is None or _rank(colour) > _rank(worst):
            worst = colour

    spo2 = v.get("spo2")
    if isinstance(spo2, (int, float)):
        if spo2 < 90:
            bump("Red", f"SpO2 {spo2}% — severe hypoxia")
        elif spo2 < 94:
            bump("Yellow", f"SpO2 {spo2}% — hypoxia")

    hr = v.get("hr")
    if isinstance(hr, (int, float)):
        if hr > 130 or hr < 40:
            bump("Red", f"HR {hr} bpm — extreme")
        elif hr > 100 or hr < 50:
            bump("Yellow", f"HR {hr} bpm — abnormal")

    rr = v.get("rr")
    if isinstance(rr, (int, float)):
        if rr > 30 or rr < 8:
            bump("Red", f"RR {rr}/min — extreme")
        elif rr > 20:
            bump("Yellow", f"RR {rr}/min — tachypnoea")

    temp = v.get("temp")
    if isinstance(temp, (int, float)):
        if temp >= 40 or temp < 35:
            bump("Red", f"Temp {temp}°C — extreme")
        elif temp >= 38:
            bump("Yellow", f"Temp {temp}°C — fever")

    bp = v.get("bp")
    if isinstance(bp, str) and "/" in bp:
        try:
            sys_bp, dia_bp = [int(re.sub(r"\D", "", x)) for x in bp.split("/")[:2]]
            if sys_bp < 90:
                bump("Red", f"BP {bp} — hypotension")
            elif sys_bp > 180 or dia_bp > 110:
                bump("Yellow", f"BP {bp} — severe hypertension")
        except Exception:
            pass                      # an unparseable BP is not a triage decision

    return worst, findings


def assess(
    chief_complaint: str,
    vitals: Optional[Dict[str, Any]] = None,
    pain_score: Optional[int] = None,
    age: Optional[int] = None,
    known_conditions: Optional[str] = None,
) -> Dict[str, Any]:
    """Assess a presentation. Always returns a usable result; never raises."""
    text = " " + re.sub(r"\s+", " ", str(chief_complaint or "").lower().strip()) + " "
    reasons: List[str] = []

    # 1. red flags in the complaint
    band = None
    hit = _match(text, _IMMEDIATE)
    if hit:
        band, reasons = RED, [hit]
    else:
        hit = _match(text, _VERY_URGENT)
        if hit:
            band, reasons = ORANGE, [hit]

    # 2. physiology, which can only ever raise the band
    v_colour, v_findings = _assess_vitals(vitals)
    reasons += v_findings

    # 3. pain
    if isinstance(pain_score, (int, float)):
        if pain_score >= 8:
            reasons.append(f"Severe pain ({pain_score}/10)")
            v_colour = "Red" if _rank("Red") > _rank(v_colour or "Green") else v_colour
        elif pain_score >= 5:
            reasons.append(f"Moderate pain ({pain_score}/10)")
            if _rank("Yellow") > _rank(v_colour or "Green"):
                v_colour = "Yellow"

    # 4. the rest of the complaint, if nothing serious has fired yet
    if band is None:
        hit = _match(text, _URGENT)
        if hit:
            band, reasons = YELLOW, reasons + [hit]
        else:
            hit = _match(text, _ROUTINE)
            if hit:
                band, reasons = GREEN, reasons + [hit]
            else:
                # Nothing recognised. This is the branch that decides whether the
                # system is safe. An unrecognised complaint is NOT reassurance,
                # so it goes to Yellow for a human to look at.
                band = YELLOW
                reasons.append("Presentation not recognised by offline rules; "
                               "flagged for clinician review")

    # 5. vulnerable groups nudge upwards
    if isinstance(age, (int, float)):
        if age < 2 and band is GREEN:
            band = YELLOW
            reasons.append("Infant under 2")
        elif age >= 70 and band is GREEN:
            band = YELLOW
            reasons.append("Age 70 or over")

    if known_conditions:
        kc = known_conditions.lower()
        if any(w in kc for w in ("immunocompromis", "chemo", "transplant", "hiv")) and band is GREEN:
            band = YELLOW
            reasons.append("Immunocompromised")

    # 6. take the worst of complaint band and physiology
    result = dict(band)
    if v_colour and _rank(v_colour) > _rank(result["colour"]):
        result = dict(RED if v_colour == "Red" else YELLOW)

    result["reasoning"] = "; ".join(dict.fromkeys(reasons)) or "Routine presentation"
    result["engine"] = "offline-rules"
    result["confidence"] = "screening"
    result["disclaimer"] = ("Offline screening aid, not a diagnosis. "
                            "A clinician must confirm the category.")
    return result


def reconcile(llm: Dict[str, Any], offline: Dict[str, Any]) -> Dict[str, Any]:
    """Combine an LLM result with the offline assessment, taking the HIGHER
    acuity of the two.

    The LLM is better at reading messy free text; the rules cannot miss a red
    flag they were told about. Taking the worse of the two means a hallucinated
    'Green' can never override an observed SpO2 of 88%."""
    try:
        if not isinstance(llm, dict) or not llm.get("colour"):
            return offline
        if _rank(str(offline.get("colour"))) > _rank(str(llm.get("colour"))):
            merged = dict(offline)
            merged["engine"] = "offline-rules (escalated over AI)"
            merged["reasoning"] = (
                f"{offline.get('reasoning', '')} "
                f"[AI suggested {llm.get('colour')}; escalated on protocol]").strip()
            return merged
        out = dict(llm)
        out.setdefault("engine", "ai")
        if offline.get("reasoning"):
            out["offline_check"] = offline["reasoning"]
        return out
    except Exception:
        return offline
