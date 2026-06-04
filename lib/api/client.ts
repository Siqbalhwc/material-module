import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      config.headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  }
  return config;
});

// ── Gate Pass ─────────────────────────────────────────────────
export const gatePassApi = {
  list: (params?: Record<string, unknown>) => api.get("/gate-pass", { params }),
  get:  (id: string)  => api.get(`/gate-pass/${id}`),
  create: (data: unknown) => api.post("/gate-pass", data),
  approve: (id: string)   => api.patch(`/gate-pass/${id}/approve`),
  verify:  (id: string)   => api.patch(`/gate-pass/${id}/verify`),
};

// ── Requisitions ──────────────────────────────────────────────
export const requisitionApi = {
  list:   (params?: Record<string, unknown>) => api.get("/requisitions", { params }),
  get:    (id: string) => api.get(`/requisitions/${id}`),
  create: (data: unknown) => api.post("/requisitions", data),
  submit: (id: string)    => api.patch(`/requisitions/${id}/submit`),
  approve:(id: string)    => api.patch(`/requisitions/${id}/approve`),
  issue:  (id: string)    => api.patch(`/requisitions/${id}/issue`),
};

// ── WIP ───────────────────────────────────────────────────────
export const wipApi = {
  list:   (params?: Record<string, unknown>) => api.get("/wip", { params }),
  get:    (id: string) => api.get(`/wip/${id}`),
  create: (data: unknown) => api.post("/wip", data),
  start:  (id: string)    => api.patch(`/wip/${id}/start`),
  complete:(id: string, data: unknown) => api.patch(`/wip/${id}/complete`, data),
};

// ── RC Store ──────────────────────────────────────────────────
export const rcApi = {
  list:   (params?: Record<string, unknown>) => api.get("/rc-movements", { params }),
  create: (data: unknown) => api.post("/rc-movements", data),
};

// ── Finished Goods ────────────────────────────────────────────
export const fgApi = {
  list:     (params?: Record<string, unknown>) => api.get("/finished-goods", { params }),
  transfer: (data: unknown) => api.post("/finished-goods/transfer", data),
};

// ── Dispatch ──────────────────────────────────────────────────
export const dispatchApi = {
  list:     (params?: Record<string, unknown>) => api.get("/dispatch", { params }),
  get:      (id: string) => api.get(`/dispatch/${id}`),
  create:   (data: unknown) => api.post("/dispatch", data),
  dispatch: (id: string)    => api.patch(`/dispatch/${id}/dispatch`),
};

// ── Products ──────────────────────────────────────────────────
export const productsApi = {
  list:   (params?: Record<string, unknown>) => api.get("/products", { params }),
  get:    (id: string) => api.get(`/products/${id}`),
  create: (data: unknown) => api.post("/products", data),
  update: (id: string, data: unknown) => api.put(`/products/${id}`, data),
};

// ── Stock Balance ─────────────────────────────────────────────
export const stockApi = {
  balance: (params?: Record<string, unknown>) => api.get("/stock/balance", { params }),
  ledger:  (params?: Record<string, unknown>) => api.get("/stock/ledger", { params }),
};

export default api;
