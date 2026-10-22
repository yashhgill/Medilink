import React, { useEffect, useState } from "react";
import { DownloadSimple, X } from "@phosphor-icons/react";
import { PRODUCT } from "@/brand";

/* App-install nudge. Chrome/Android: uses beforeinstallprompt.
   iOS Safari: shows a one-time "Add to Home Screen" hint. */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone || sessionStorage.getItem("ml_install_dismissed")) return;

    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari) { setIosHint(true); setShow(true); }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => { setShow(false); sessionStorage.setItem("ml_install_dismissed", "1"); };
  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  if (!show) return null;
  return (
    <div style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      className="fixed inset-x-4 z-[60] max-w-md mx-auto rounded-2xl shadow-2xl border border-[#DAE2DF] bg-white p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#0A6E62" }}>
        <DownloadSimple size={22} color="#fff" weight="duotone" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[#10262E]">Install {PRODUCT.name}</div>
        <div className="text-xs text-[#566663]">
          {iosHint ? "Tap Share, then “Add to Home Screen”." : "Add to your home screen for quick, app-like access."}
        </div>
      </div>
      {!iosHint && (
        <button onClick={install} className="px-3 py-2 rounded-full text-sm font-semibold text-white" style={{ background: "#0A6E62" }}>
          Install
        </button>
      )}
      <button onClick={dismiss} className="w-8 h-8 rounded-lg hover:bg-[var(--ml-wash)] flex items-center justify-center text-[#566663]">
        <X size={16} />
      </button>
    </div>
  );
}
