// When the patient opens Pulih through the Pulih phone app, the app adds
// "PulihApp" to the browser's user agent. The app's own start screen (where
// the patient picks their clinic) lives at the app's local address.
export const inPulihApp = () => typeof navigator !== "undefined" && /PulihApp/.test(navigator.userAgent || "");
export const appHome = () => (/Android/i.test(navigator.userAgent || "") ? "https://localhost/" : "capacitor://localhost/");
export const changeClinic = () => { window.location.href = appHome() + "?change=1"; };
