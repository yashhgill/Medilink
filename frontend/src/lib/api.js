import axios from "axios";

// Use the same host the page was served from (works on phone/kiosk/laptop).
// An explicit non-localhost REACT_APP_BACKEND_URL still wins (e.g. cloud deploys).
// Same-origin by default: the dev server proxies /api (and websockets) to the
// backend, so the app works over HTTPS on any device with no mixed content.
const envUrl = process.env.REACT_APP_BACKEND_URL;
export const BACKEND_URL = envUrl && !envUrl.includes("localhost") ? envUrl : "";
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ml_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      // optional auto-logout on expired token
    }
    return Promise.reject(err);
  }
);

export default api;

// True when the app is being served from the public internet (tunnel) rather
// than the clinic LAN. Public visitors get the patient experience only.
const _host = window.location.hostname;
export const IS_PUBLIC = !(
  /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(_host) ||
  _host.endsWith(".local")   // Bonjour clinic-LAN hostname (e.g. mymac.local)
);

// Safe error message: FastAPI validation errors return arrays, which crash toasts.
export const errMsg = (e, fallback) => {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};
