export type ApiError = {
    message: string;
    fieldErrors?: Record<string, string>;
    status?: number;
};
const TOKEN_KEY = "auth_token";

const RAW_API = import.meta.env.VITE_API_URL ?? "";
const API = RAW_API.replace(/\/+$/, "");

function joinUrl(base: string, path: string) {
    if (!path) return base;
    return base + (path.startsWith("/") ? path : `/${path}`);
}

function parseMaybeJson(contentType: string | null, raw: string): unknown {
    const isJson = contentType?.includes("application/json");
    if (isJson) {
        try {
            return JSON.parse(raw);
        } catch {
        }
    }
    return raw;
}

function normalizeError(body: unknown): ApiError {
    if (body && typeof body === "object") {
        const anyBody = body as any;
        const message =
            typeof anyBody.message === "string" ? anyBody.message :
                typeof anyBody.error === "string" ? anyBody.error :
                    "Error desconocido";
        const fieldErrors =
            anyBody.fieldErrors && typeof anyBody.fieldErrors === "object"
                ? anyBody.fieldErrors
                : undefined;
        return {message, fieldErrors};
    }
    const message = typeof body === "string" && body.trim() ? body : "Error desconocido";
    return {message};
}

const DEFAULT_TIMEOUT = 15000;

async function handle<T>(res: Response): Promise<T> {
    if (res.status === 204 || res.status === 205 || res.headers.get("content-length") === "0") {
        if (!res.ok) throw {message: `Error ${res.status}`} satisfies ApiError;
        return undefined as T;
    }

    const ct = res.headers.get("content-type");
    const raw = await res.text();
    const body = parseMaybeJson(ct, raw);

    if (!res.ok) {
        const err = normalizeError(body);
        (err as any).status = res.status;
        throw err;
    }
    return body as T;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function req<T>(method: Method, path: string, data?: unknown, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const res = await fetch(joinUrl(API, path), {
            method,
            headers: {
                "Content-Type": "application/json",
                ...authHeader(),
                ...(init?.headers ?? {}),
            },
            body: data !== undefined ? JSON.stringify(data) : undefined,
            credentials: "include",
            signal: ac.signal,
            ...init,
        });
        return await handle<T>(res);
    } catch (e: any) {
        if (e?.name === "AbortError") {
            throw {message: "La solicitud tardó demasiado (timeout)."} satisfies ApiError;
        }
        throw e?.message ? e : {message: "Fallo de red o servidor no disponible."} satisfies ApiError;
    } finally {
        clearTimeout(t);
    }
}

export function getJSON<T>(path: string, init?: RequestInit) {
    return req<T>("GET", path, undefined, init);
}

export function postJSON<T>(path: string, data: unknown, init?: RequestInit) {
    return req<T>("POST", path, data, init);
}

export function putJSON<T>(path: string, data: unknown, init?: RequestInit) {
    return req<T>("PUT", path, data, init);
}

export function patchJSON<T>(path: string, data: unknown, init?: RequestInit) {
    return req<T>("PATCH", path, data, init);
}

export function delJSON<T>(path: string, init?: RequestInit) {
    return req<T>("DELETE", path, undefined, init);
}

export function getToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

function authHeader(): Record<string, string> {
    const t = getToken();
    return t ? {Authorization: `Bearer ${t}`} : {};
}

/** AUTH **/

export type LoginReq = { email: string; password: string };

export type LoginRes = {
    message?: string;
    userId?: number;
    email?: string;
    token?: string | null;
};

export function login(req: LoginReq) {
    return postJSON<LoginRes>("/auth/login", req);
}

export type RegisterReq = {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    institution: string;
};

export type RegisterRes = {
    id?: number;
    userId?: number;
    email: string;
    requiresVerification?: boolean;
    message?: string;
};

export function register(req: RegisterReq) {
    return postJSON<RegisterRes>("/users", req);
}

/** PIPELINE **/

export type CreateSessionRes = {
    id: string;
    sessionId?: string;
    [key: string]: any;
};

export async function createPipelineSession(file: File): Promise<CreateSessionRes> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(joinUrl(API, "/pipeline/sessions"), {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: {
            ...authHeader(),
        },
    });

    if (!res.ok) {
        if (res.status === 413) {
            throw {message: "El archivo supera el máximo permitido por el servidor."};
        }
        let msg = "";
        try {
            msg = await res.text();
        } catch {
        }
        throw {message: msg || "Falló la creación de la sesión."};
    }

    return await res.json();
}