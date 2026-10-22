"""
Safety tests for the offline triage engine.

    cd backend && python3 -m pytest test_triage_offline.py -q

These are not ordinary unit tests. Under-triage is the failure mode that hurts
a patient: someone sent to the Green queue who needed Red waits two hours in a
plastic chair. Over-triage merely wastes a clinician's time.

So every test here asserts a FLOOR, never an exact value. If a future change
makes the engine more cautious these still pass; if it ever makes it less
cautious on one of these presentations, they fail.
"""
import pytest

import triage_offline as T

RANK = {"Green": 1, "Yellow": 2, "Red": 3}


def at_least(result, colour):
    return RANK[result["colour"]] >= RANK[colour]


# ── red flags must always reach Red ──────────────────────────────────────────
@pytest.mark.parametrize("complaint", [
    "chest pain and shortness of breath",
    "crushing pressure in my chest",
    "sakit dada",                        # Malay
    "can't breathe",
    "cannot breathe properly",
    "tak boleh bernafas",
    "choking on food",
    "collapsed at home, unresponsive",
    "pengsan tiba-tiba",
    "face droop and slurred speech",
    "weakness on one side",
    "heavy bleeding from the wound",
    "pendarahan teruk",
    "fitting right now",
    "sawan",
    "swollen tongue after eating peanuts",
    "anaphylaxis",
    "I want to kill myself",
    "thinking about suicide",
    "bunuh diri",
    "pregnant and bleeding",
    "road accident, head injury",
])
def test_red_flags_are_red(complaint):
    assert at_least(T.assess(complaint), "Red"), complaint


# ── physiology overrides a reassuring complaint ──────────────────────────────
@pytest.mark.parametrize("vitals,floor", [
    ({"spo2": 88}, "Red"),
    ({"spo2": 92}, "Yellow"),
    ({"hr": 135}, "Red"),
    ({"hr": 38}, "Red"),
    ({"hr": 110}, "Yellow"),
    ({"rr": 34}, "Red"),
    ({"rr": 24}, "Yellow"),
    ({"temp": 40.2}, "Red"),
    ({"temp": 34.5}, "Red"),
    ({"temp": 38.5}, "Yellow"),
    ({"bp": "85/50"}, "Red"),
    ({"bp": "190/115"}, "Yellow"),
])
def test_vitals_override_reassuring_words(vitals, floor):
    # "just a cough" would otherwise be Green
    assert at_least(T.assess("just a cough", vitals=vitals), floor), vitals


# ── the branch that decides whether this is safe ─────────────────────────────
@pytest.mark.parametrize("complaint", [
    "",
    "   ",
    "blurgh flibbertigibbet",
    "asdkjhaskjdh",
    "not sure what is wrong",
    "🤒",
])
def test_unrecognised_input_is_never_green(complaint):
    """An input we cannot parse is not reassurance. It must go to a human."""
    r = T.assess(complaint)
    assert r["colour"] != "Green", f"{complaint!r} was triaged Green"
    assert at_least(r, "Yellow")


def test_none_complaint_does_not_raise():
    assert T.assess(None)["colour"] != "Green"


# ── vulnerable groups ────────────────────────────────────────────────────────
def test_infant_is_escalated():
    assert at_least(T.assess("routine check up", age=1), "Yellow")


def test_elderly_is_escalated():
    assert at_least(T.assess("routine check up", age=78), "Yellow")


def test_immunocompromised_is_escalated():
    assert at_least(T.assess("sore throat", known_conditions="on chemo"), "Yellow")


# ── pain ─────────────────────────────────────────────────────────────────────
def test_severe_pain_escalates():
    assert at_least(T.assess("sore throat", pain_score=9), "Red")


def test_moderate_pain_escalates():
    assert at_least(T.assess("sore throat", pain_score=6), "Yellow")


# ── genuinely routine presentations stay routine ─────────────────────────────
@pytest.mark.parametrize("complaint", [
    "mild sore throat since yesterday",
    "batuk dan selsema",
    "follow-up for blood pressure medication",
    "repeat prescription",
    "need a medical check up for work",
])
def test_routine_stays_green(complaint):
    """Over-triaging everything would be 'safe' and useless. The engine has to
    still be able to say Green, or the queue means nothing."""
    assert T.assess(complaint, age=35)["colour"] == "Green", complaint


# ── reconcile() ──────────────────────────────────────────────────────────────
def test_ai_cannot_downgrade_observed_hypoxia():
    offline = T.assess("just a cough", vitals={"spo2": 87})
    llm = {"colour": "Green", "category": "Standard", "target_wait_minutes": 120}
    merged = T.reconcile(llm, offline)
    assert merged["colour"] == "Red"
    assert "escalated" in merged["engine"]


def test_ai_may_escalate_above_the_rules():
    offline = T.assess("sore throat", age=35)
    llm = {"colour": "Red", "category": "Very urgent", "target_wait_minutes": 10}
    assert T.reconcile(llm, offline)["colour"] == "Red"


@pytest.mark.parametrize("junk", [None, {}, {"colour": None}, "not a dict", 42])
def test_reconcile_survives_garbage_from_the_model(junk):
    offline = T.assess("chest pain")
    assert T.reconcile(junk, offline)["colour"] == "Red"


# ── shape ────────────────────────────────────────────────────────────────────
def test_result_always_has_the_fields_the_ui_needs():
    for c in ["chest pain", "sore throat", "", "blah"]:
        r = T.assess(c)
        for k in ("category", "colour", "zone", "target_wait_minutes",
                  "reasoning", "engine", "disclaimer"):
            assert k in r, f"{k} missing for {c!r}"
        assert r["colour"] in ("Red", "Yellow", "Green")
        assert isinstance(r["target_wait_minutes"], int)
