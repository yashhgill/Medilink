"""
Offline replacements for the AI-assisted features.

Why this exists
---------------
Core is the offline tier, and a clinic machine has no Groq API key. Every AI
endpoint previously raised 503, so a paying customer saw "AI not configured" on
features the product advertises.

The rule applied throughout this module, and it is not negotiable:

    ORGANISE data we hold. NEVER invent clinical facts.

A summary built by re-arranging the patient's own records is honest. A drug
interaction "generated" without a pharmacology source is a fabrication that
could kill someone. So:

  • summary        -> built entirely from stored records. Safe.
  • symptom advice -> the deterministic Manchester Triage rules in
                      triage_offline.py, which are tested and fail upwards. Safe.
  • drug check     -> allergy cross-check ONLY, from the allergies the clinic
                      recorded. Interaction screening is explicitly declined,
                      because we have no drug database offline and guessing is
                      not an option.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import triage_offline


# ── 1. patient summary ───────────────────────────────────────────────────────
def local_summary(patient: Dict[str, Any],
                  records: List[Dict[str, Any]],
                  todays: Optional[Dict[str, Any]] = None) -> str:
    """A structured pre-consultation brief, assembled from stored records only.

    Deliberately reads as notes rather than prose: a doctor scanning this before
    a consultation wants facts positioned predictably, not paragraphs."""
    name = patient.get("name") or "This patient"
    lines: List[str] = []

    # today
    if todays:
        lines.append("TODAY'S PRESENTATION")
        reason = (todays.get("reason") or "").strip()
        lines.append(f"  Reported at check-in: \"{reason or 'not stated'}\"")
        cat, colour = todays.get("triage_category"), todays.get("triage_colour")
        if cat or colour:
            wait = todays.get("triage_target_mins")
            lines.append(f"  Triage: {cat or '-'} ({colour or '-'})"
                         + (f", target wait {wait} min" if wait else ""))
        lines.append("")

    # allergies first: the thing that changes prescribing
    allergies = _collect(records, "allergies")
    lines.append("ALLERGIES")
    lines.append("  " + ("; ".join(allergies) if allergies
                         else "None recorded. Confirm verbally before prescribing."))
    lines.append("")

    if not records:
        lines.append("HISTORY")
        lines.append("  No prior records at this clinic. Treat as a first visit.")
        return "\n".join(lines)

    # recurring diagnoses tell you more than a list of visits
    diagnoses = [d for d in (_text(r.get("diagnosis")) for r in records) if d]
    recurring = _recurring(diagnoses)
    if recurring:
        lines.append("RECURRING PRESENTATIONS")
        for term, n in recurring:
            lines.append(f"  {term} ({n} visits)")
        lines.append("")

    # current medication
    meds = _collect_meds(records[:3])
    if meds:
        lines.append("RECENT MEDICATION")
        for m in meds:
            lines.append(f"  {m}")
        lines.append("")

    # the visits themselves, most recent first
    lines.append(f"VISIT HISTORY ({len(records)} on file, most recent first)")
    for r in records[:6]:
        when = (r.get("created_at") or "")[:10] or "date unknown"
        dx = _text(r.get("diagnosis")) or "no diagnosis recorded"
        fac = r.get("facility_id") or "-"
        lines.append(f"  {when} | {dx} | {fac}")
        note = _text(r.get("notes"))
        if note:
            lines.append(f"      {note[:160]}{'…' if len(note) > 160 else ''}")
    if len(records) > 6:
        lines.append(f"  … and {len(records) - 6} earlier visits")
    lines.append("")

    lines.append("Generated locally from this clinic's records. "
                 "No AI service was used, so nothing here is inferred.")
    return "\n".join(lines)


def _text(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def _collect(records: List[Dict[str, Any]], field: str) -> List[str]:
    seen, out = set(), []
    for r in records:
        v = _text(r.get(field))
        if v and v.lower() not in ("none", "nil", "-", "n/a") and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


def _collect_meds(records: List[Dict[str, Any]]) -> List[str]:
    seen, out = set(), []
    for r in records:
        for p in (r.get("prescriptions") or []):
            if isinstance(p, dict):
                med = _text(p.get("medicine"))
                dose = _text(p.get("dosage") or p.get("dose"))
                label = f"{med} {dose}".strip()
            else:
                label = _text(p)
            if label and label.lower() not in seen:
                seen.add(label.lower())
                out.append(label)
    return out


_STOP = {"the", "and", "with", "for", "of", "a", "an", "to", "in", "on",
         "suspected", "possible", "acute", "chronic", "mild", "severe"}


def _recurring(diagnoses: List[str]) -> List[tuple]:
    counts: Dict[str, int] = {}
    for d in diagnoses:
        for word in re.findall(r"[a-z]{4,}", d.lower()):
            if word not in _STOP:
                counts[word] = counts.get(word, 0) + 1
    return sorted([(w.title(), n) for w, n in counts.items() if n >= 2],
                  key=lambda x: -x[1])[:5]


# ── 2. patient-facing symptom advice ─────────────────────────────────────────
def local_symptom_reply(message: str) -> str:
    """Advice for the patient app when no AI service is reachable.

    Uses the same tested Manchester Triage rules the clinic kiosk uses, so the
    advice a patient gets offline is consistent with what the clinic would say,
    and errs upward exactly the same way."""
    r = triage_offline.assess(chief_complaint=message)
    colour = r["colour"]

    if colour == "Red":
        body = ("Based on what you've described, this needs urgent attention. "
                "Please go to the nearest Emergency Department now, or call 999.")
    elif colour == "Yellow":
        body = ("This should be seen today or tomorrow. Please book an appointment "
                "at the clinic. If it gets worse before then, go to the Emergency "
                "Department.")
    else:
        body = ("This does not look urgent. Rest and monitor it. If it worsens, or "
                "lasts more than 48 hours, book a clinic visit.")

    zone = {"Red": "MERAH/Red", "Yellow": "KUNING/Yellow", "Green": "HIJAU/Green"}[colour]
    return (f"Triage: {zone}\n\n{body}\n\n"
            f"(Offline assessment, based on clinical triage rules. "
            f"Not medical advice / bukan nasihat perubatan.)")


# ── 3. medication safety, without inventing pharmacology ─────────────────────
# Drug-class membership for the allergy families that actually cause harm in
# primary care. This is settled, non-controversial classification (amoxicillin
# IS a penicillin), NOT invented interaction data.
#
# A pure name match misses the case that matters most: a patient allergic to
# "penicillin" prescribed "Amoxicillin". The strings share no common substring,
# so a naive check reports "no conflict" on a prescription that could cause
# anaphylaxis.
#
# This map is deliberately small. It is not a pharmacopoeia, and the wording
# below never presents a non-match as safety.
_DRUG_CLASSES: Dict[str, List[str]] = {
    "penicillin": ["amoxicillin", "ampicillin", "cloxacillin", "flucloxacillin",
                   "benzylpenicillin", "phenoxymethylpenicillin", "augmentin",
                   "co-amoxiclav", "piperacillin"],
    "cephalosporin": ["cefalexin", "cephalexin", "cefuroxime", "ceftriaxone",
                      "cefixime", "cefotaxime"],
    "sulfonamide": ["sulfamethoxazole", "co-trimoxazole", "bactrim", "septrin",
                    "sulfasalazine"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen", "mefenamic", "aspirin",
              "celecoxib", "ketoprofen"],
    "macrolide": ["erythromycin", "azithromycin", "clarithromycin"],
    "quinolone": ["ciprofloxacin", "levofloxacin", "ofloxacin", "norfloxacin"],
    "tetracycline": ["doxycycline", "minocycline", "tetracycline"],
    "opioid": ["morphine", "codeine", "tramadol", "fentanyl", "oxycodone"],
}

# Penicillin-allergic patients have a recognised, if small, cross-reactivity
# risk with cephalosporins. Worth surfacing for a prescriber to weigh.
_CROSS_REACTIVE = {"penicillin": ["cephalosporin"]}


def _classes_for(term: str) -> List[str]:
    """Which drug classes does this string belong to?

    Matches both directions on purpose. Clinicians write allergies in shorthand
    ("sulfa", "pen V"), so the recorded term is often a PREFIX of the real class
    or member name rather than a substring of it. Only matching one way meant
    "sulfa" failed to connect to co-trimoxazole."""
    t = term.strip().lower()
    if not t:
        return []
    out = []
    for cls, members in _DRUG_CLASSES.items():
        names = [cls] + members
        if any(n in t for n in names):                       # "amoxicillin 500mg"
            out.append(cls)
        elif len(t) >= 4 and any(n.startswith(t) for n in names):   # "sulfa" -> sulfonamide
            out.append(cls)
    return out


def local_drug_check(medicines: List[str],
                     recorded_allergies: Optional[str] = None) -> Dict[str, Any]:
    """Allergy cross-check only, by name AND by drug class.

    We deliberately do NOT attempt interaction screening offline. There is no
    drug database in the installer, and a plausible-sounding invented
    interaction is far more dangerous than an honest "not available", because a
    prescriber might trust it.
    """
    allergy_terms = [t.strip().lower() for t in
                     re.split(r"[,;/]| and ", recorded_allergies or "")
                     if t.strip() and t.strip().lower() not in ("none", "nil", "-", "n/a")]

    hits = []
    for med in medicines:
        m = med.lower()
        med_classes = _classes_for(m)
        for term in allergy_terms:
            # 1. direct name match
            if len(term) >= 4 and (term in m or m.split()[0] in term):
                hits.append({"medicine": med, "allergy": term,
                             "basis": "name", "severity": "high"})
                continue
            # 2. same drug class (amoxicillin vs a penicillin allergy)
            allergy_classes = _classes_for(term)
            shared = set(med_classes) & (set(allergy_classes) | {term})
            if shared:
                hits.append({"medicine": med, "allergy": term,
                             "basis": f"same class ({sorted(shared)[0]})",
                             "severity": "high"})
                continue
            # 3. known cross-reactivity
            for a_cls in (set(allergy_classes) | {term}):
                for x in _CROSS_REACTIVE.get(a_cls, []):
                    if x in med_classes:
                        hits.append({"medicine": med, "allergy": term,
                                     "basis": f"cross-reactivity ({a_cls} to {x})",
                                     "severity": "caution"})

    return {
        "medicines": medicines,
        "allergy_conflicts": hits,
        "interaction_screening": "unavailable_offline",
        "analysis": _drug_text(medicines, allergy_terms, hits),
        "engine": "offline-rules",
    }


def _drug_text(medicines, allergy_terms, hits) -> str:
    out = ["ALLERGY CHECK (from this clinic's records)"]
    if hits:
        out.append("")
        for h in hits:
            mark = "⚠️ " if h.get("severity") == "high" else "•  "
            out.append(f"  {mark} {h['medicine']} vs recorded allergy "
                       f"\"{h['allergy']}\" — {h.get('basis', 'name match')}. "
                       f"Confirm with the patient before prescribing.")
    elif allergy_terms:
        # Deliberately NOT phrased as "no conflict" or "safe". This check knows
        # a limited set of drug classes, so silence here is absence of evidence,
        # not evidence of absence, and a prescriber must not read it as clearance.
        out.append(f"  No match found against recorded allergies "
                   f"({', '.join(allergy_terms)}).")
        out.append("  This checks drug NAMES and a limited set of drug CLASSES "
                   "only. It is not a clearance. Confirm the class with the "
                   "patient before prescribing.")
    else:
        out.append("  No allergies recorded for this patient. "
                   "Confirm verbally before prescribing.")

    out += [
        "",
        "DRUG INTERACTION SCREENING",
        "  Not available offline.",
        "",
        "  This installation has no drug interaction database, and MediLink "
        "will not guess at one. Please check interactions against MIMS, the BNF, "
        "or your usual reference.",
        "",
        "⚠️ Clinical judgement required. This is a screening aid only.",
    ]
    return "\n".join(out)
