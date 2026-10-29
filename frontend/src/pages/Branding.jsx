import React, { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Upload, Trash, CheckCircle, WarningCircle, Image, QrCode, X,
} from "@phosphor-icons/react";

// ── tiny helper ──────────────────────────────────────────────────────────────
function ImageSlot({ label, hint, slot, src, hasImage, onUploaded, onDeleted }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState(src || null);

  useEffect(() => { setPreview(src || null); }, [src]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Only PNG / JPG / WEBP files are accepted.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/branding/${slot}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${label} uploaded successfully.`);
      onUploaded(data);
    } catch (err) {
      toast.error(`Upload failed: ${err?.response?.data?.detail || err.message}`);
      setPreview(src || null);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Remove the current ${label}?`)) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/branding/${slot}`);
      toast.success(`${label} removed.`);
      setPreview(null);
      onDeleted(data);
    } catch (err) {
      toast.error(`Delete failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  const Icon = slot === "duitnow" ? QrCode : Image;

  return (
    <div className="rounded-xl border border-[#D6E4E8] bg-white p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-[var(--ml-primary-soft)]">{label}</p>
          <p className="text-xs text-[#566663] mt-0.5">{hint}</p>
        </div>
        {(hasImage || preview) ? (
          <CheckCircle size={20} className="text-green-500" weight="fill" />
        ) : (
          <WarningCircle size={20} className="text-amber-400" weight="fill" />
        )}
      </div>

      {/* Preview */}
      <div
        className="rounded-lg border border-dashed border-[#B0CDD4] bg-[#EEF2F1] flex items-center justify-center overflow-hidden"
        style={{ minHeight: 120 }}
      >
        {preview ? (
          <img
            src={preview}
            alt={label}
            className="max-h-40 max-w-full object-contain p-2"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-[#8CAAB2]">
            <Icon size={32} weight="light" />
            <span className="text-xs">No image uploaded</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-1 bg-[var(--ml-primary-soft)] hover:bg-[#0A1A20] text-white"
        >
          <Upload size={14} className="mr-1.5" />
          {uploading ? "Uploading…" : (preview ? "Replace" : "Upload")}
        </Button>
        {(hasImage || preview) && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash size={14} className="mr-1" />
            {deleting ? "…" : "Remove"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function Branding() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clinic_name: "", clinic_address: "", clinic_phone: "",
    registration_no: "", email: "",
    letterhead_line1: "", letterhead_line2: "",
    footer_note: "", payment_note: "",
    brand_colour: "#0A6E62", consultation_fee: "50", opening_hours: "", welcome_message: "",
  });

  useEffect(() => {
    api.get("/branding")
      .then(({ data }) => {
        setCfg(data);
        setForm({
          clinic_name:      data.clinic_name      || "",
          clinic_address:   data.clinic_address   || "",
          clinic_phone:     data.clinic_phone     || "",
          registration_no:  data.registration_no  || "",
          email:            data.email            || "",
          letterhead_line1: data.letterhead_line1 || "",
          letterhead_line2: data.letterhead_line2 || "",
          footer_note:      data.footer_note      || "",
          payment_note:     data.payment_note     || "",
          brand_colour:     data.brand_colour     || "#0A6E62",
          consultation_fee: String(data.consultation_fee ?? 50),
          opening_hours:    data.opening_hours    || "",
          welcome_message:  data.welcome_message  || "",
        });
      })
      .catch(() => toast.error("Failed to load branding settings."))
      .finally(() => setLoading(false));
  }, []);

  function field(key) {
    return {
      value: form[key],
      onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const fee = Number(form.consultation_fee);
      if (Number.isNaN(fee) || fee < 0) { toast.error("Enter the consultation fee in ringgit, for example 45."); setSaving(false); return; }
      const { data } = await api.patch("/branding", { ...form, consultation_fee: fee });
      setCfg(data);
      window.dispatchEvent(new Event("medilink:branding"));
      toast.success("Clinic settings saved.");
    } catch (err) {
      toast.error(`Save failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const isAdmin = ["admin","super_admin","clinic_admin"].includes(user?.role);

  const slot = (label, hint, key, srcKey, hasKey) => (
    <ImageSlot label={label} hint={hint} slot={key} src={cfg?.[srcKey] || null} hasImage={cfg?.[hasKey]}
      onUploaded={(d) => { setCfg(d); window.dispatchEvent(new Event("medilink:branding")); }}
      onDeleted={(d) => { setCfg(d); }} />
  );
  const PRESETS = ["#0A6E62", "#1F5FA8", "#6B3FA0", "#B23A48", "#C2621B", "#2F6B2F", "#10262E"];

  return (
    <AppShell title="Clinic settings" subtitle="Your clinic's look, fees and documents">
      {loading ? (
        <div className="text-[15px] text-[#566663] py-10 text-center">Loading settings…</div>
      ) : !isAdmin ? (
        <div className="panel p-6 text-[15px] text-[#566663]">Only a clinic administrator can change these settings.</div>
      ) : (
        <>
        <form onSubmit={handleSave} className="space-y-5 max-w-[1100px]">
          <Section title="Look" intro="Your logo and colour appear on every screen, the kiosk, receipts and the patient app.">
            <div className="grid sm:grid-cols-[220px_1fr] gap-6 items-start">
              {slot("Clinic logo", "PNG or JPG, square works best", "logo", "logo", "has_logo")}
              <div>
                <Label className="text-[14px] font-semibold">Brand colour</Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {PRESETS.map((c) => (
                    <button type="button" key={c} onClick={() => setForm((f) => ({ ...f, brand_colour: c }))}
                      aria-label={`Use colour ${c}`} aria-pressed={form.brand_colour.toLowerCase() === c.toLowerCase()}
                      className={`w-9 h-9 rounded-full border-2 ${form.brand_colour.toLowerCase() === c.toLowerCase() ? "border-[#10201D] ring-2 ring-offset-2 ring-[#10201D]" : "border-white shadow"}`}
                      style={{ background: c }} />
                  ))}
                  <label className="flex items-center gap-2 ml-1 text-[14px] text-[#566663]">
                    <input type="color" value={form.brand_colour} onChange={(e) => setForm((f) => ({ ...f, brand_colour: e.target.value }))}
                      className="w-9 h-9 rounded-full border border-[#C8D3CF] bg-white p-0.5 cursor-pointer" /> Custom
                  </label>
                </div>
                <div className="mt-4 rounded-xl border border-[#DAE2DF] p-4 flex flex-wrap items-center gap-3" aria-label="Preview">
                  <span className="px-4 h-10 rounded-full text-white text-[15px] font-semibold flex items-center" style={{ background: form.brand_colour }}>Find patient</span>
                  <span className="px-4 h-10 rounded-full border text-[15px] font-semibold flex items-center" style={{ color: form.brand_colour, borderColor: form.brand_colour }}>New booking</span>
                  <span className="text-[13px] text-[#566663]">Preview. Triage colours never change.</span>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Fees and payment" intro="The standard fee is used for every new visit; reception can still change one visit's fee before payment.">
            <div className="grid sm:grid-cols-2 gap-5">
              <Field bind={field("consultation_fee")} k="consultation_fee" label="Standard consultation fee (RM)" inputMode="decimal" placeholder="50" hint="Medicines are added on top from the pharmacy price list." />
              <Field bind={field("payment_note")} k="payment_note" label="Payment note at the kiosk" placeholder="For payment queries call 06-282 3100" />
              <div className="sm:col-span-2 grid sm:grid-cols-[220px_1fr] gap-5 items-start">
                {slot("DuitNow QR", "From your bank's merchant portal", "duitnow", "duitnow", "has_duitnow_qr")}
                {!cfg?.has_duitnow_qr && (
                  <div className="flex gap-2 items-start rounded-xl bg-[#FFF6DA] border border-[#F0D77A] p-4 text-[14px] text-[#5C4600]">
                    <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
                    <span>Without a DuitNow QR, patients can only pay at the counter. Download it from your bank's merchant portal and upload it here.</span>
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section title="Front door" intro="What patients see on the clinic's welcome screen and the kiosk.">
            <div className="grid sm:grid-cols-2 gap-5">
              <Field bind={field("clinic_name")} k="clinic_name" label="Clinic name" placeholder="Klinik Melaka" />
              <Field bind={field("clinic_phone")} k="clinic_phone" label="Phone" placeholder="06-282 3100" />
              <Field bind={field("clinic_address")} k="clinic_address" label="Address" wide placeholder="Jalan Kota, 75000 Melaka" />
              <Field bind={field("welcome_message")} k="welcome_message" label="Welcome message" wide placeholder="Selamat datang. Please check in at the kiosk." />
              <Field bind={field("opening_hours")} k="opening_hours" label="Opening hours" wide placeholder="Mon–Fri 8am–10pm · Sat–Sun 8am–1pm" />
            </div>
          </Section>

          <Section title="Documents" intro="Printed on receipts, medical certificates, referral letters and lab reports.">
            <div className="grid sm:grid-cols-2 gap-5">
              <Field bind={field("registration_no")} k="registration_no" label="Registration number" placeholder="MOH-KK-2024-XXXX" />
              <Field bind={field("email")} k="email" label="Email" type="email" placeholder="clinic@example.com" />
              <Field bind={field("letterhead_line1")} k="letterhead_line1" label="Letterhead line 1" placeholder="Klinik Melaka Sdn Bhd" />
              <Field bind={field("letterhead_line2")} k="letterhead_line2" label="Letterhead line 2" placeholder="(Reg. No. 123456-X)" />
              <Field bind={field("footer_note")} k="footer_note" label="Receipt footer" wide placeholder="Thank you for visiting. Get well soon." />
              <div className="sm:col-span-2 max-w-[220px]">
                {slot("Letterhead image", "Optional, replaces the text letterhead", "letterhead", "letterhead", "has_letterhead")}
              </div>
            </div>
          </Section>

          <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-end gap-3 bg-white/95 backdrop-blur border border-[#DAE2DF] sm:rounded-2xl">
            <span className="text-[13px] text-[#566663] mr-auto">Changes apply to every screen once saved.</span>
            <Button type="submit" disabled={saving} data-testid="save-settings"
              className="h-11 px-7 rounded-full text-[15px] font-semibold bg-[var(--ml-primary)] hover:bg-[var(--ml-primary-soft)] text-white">
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
        <div className="mt-5 max-w-[1100px]"><CloudSection /></div>
        </>
      )}
    </AppShell>
  );
}

function Field({ k, label, hint, wide, bind, ...rest }) {
  return (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={`f-${k}`} className="text-[14px] font-semibold text-[#10201D]">{label}</Label>
      <Input id={`f-${k}`} {...bind} {...rest} className="h-11 text-[15px] border-[#C8D3CF]" />
      {hint && <p className="text-[13px] text-[#566663]">{hint}</p>}
    </div>
  );
}

function Section({ title, intro, children }) {
  return (
    <section className="panel p-6 md:p-7 grid md:grid-cols-[16rem_1fr] gap-6">
      <div>
        <h2 className="text-[22px]">{title}</h2>
        <p className="text-[14px] text-[#566663] mt-1.5">{intro}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/* Settings → Cloud mirror: read-only status. Records are saved here first;
   the cloud is a copy that follows. */
function CloudSection() {
  const [st, setSt] = useState(null);
  useEffect(() => { api.get("/admin/cloud").then((r) => setSt(r.data)).catch(() => setSt({ error: true })); }, []);
  return (
    <Section title="Cloud mirror" intro="A copy of this clinic's records follows to the shared cloud node whenever the internet is up. The clinic keeps working offline either way.">
      {!st ? <p className="text-[15px] text-[#566663]">Checking…</p> : st.error ? (
        <p className="text-[15px] text-[#566663]">Only a clinic administrator can see the cloud status.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[14px] font-semibold ${st.connected ? (st.online ? "bg-[var(--ml-wash)] text-[var(--ml-primary-soft)]" : "bg-[#FFF6DA] text-[#5C4600]") : "bg-[#EEF3F1] text-[#566663]"}`}>
              <span className={`w-2 h-2 rounded-full ${st.connected ? (st.online ? "bg-[var(--ml-primary)]" : "bg-[#E5A800]") : "bg-[#9AA8A4]"}`} />
              {st.connected ? (st.online ? "Connected" : "Connected, cloud unreachable right now") : "Not connected: records are kept on this computer only"}
            </span>
            {st.connected && <span className="text-[14px] text-[#566663]">{st.pending ? `${st.pending} changes waiting to upload` : "Everything uploaded"}</span>}
          </div>
          <p className="text-[14px] text-[#566663]">Clinic ID <code className="px-2 py-1 rounded bg-[#EEF3F1]">{st.clinic_id}</code>. The cloud connection is set when the clinic node is started (CLOUD_DATABASE_URL).</p>
        </div>
      )}
    </Section>
  );
}
