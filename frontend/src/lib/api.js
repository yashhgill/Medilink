import axios from "axios";

// Use the same host the page was served from (works on phone/kiosk/laptop).
// An explicit non-localhost REACT_APP_BACKEND_URL still wins (e.g. cloud deploys).
const envUrl = process.env.REACT_APP_BACKEND_URL;
export const BACKEND_URL =
  envUrl && !envUrl.includes("localhost")
    ? envUrl
    : `${window.location.protocol}//${window.location.hostname}:8000`;
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
