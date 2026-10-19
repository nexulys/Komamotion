/**
 * In-memory stand-in for the Supabase REST (PostgREST) endpoints the server
 * code calls, wired into a real supabase-js client through its `fetch`
 * option. Supports the filters this codebase uses (eq, neq, is, lt, gt, in,
 * not., or=()) plus the two credit RPCs. Every request is logged so tests
 * can assert the order of writes.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Record<string, unknown>;
export type FakeDb = { tables: Record<string, Row[]>; log: { method: string; path: string; query: Record<string, string>; body: unknown }[] };

export function createFakeDb(): FakeDb {
  return { tables: {}, log: [] };
}

function splitTop(s: string) {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

const unquote = (v: string) => v.replace(/^"|"$/g, "");

function compare(x: unknown, v: string) {
  return typeof x === "number" ? x - Number(v) : Date.parse(String(x)) - Date.parse(v);
}

function test(row: Row, col: string, expr: string): boolean {
  if (expr.startsWith("not.")) return !test(row, col, expr.slice(4));
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const v = unquote(raw);
  const x = row[col];
  const nil = x === null || x === undefined;
  switch (op) {
    case "eq":
      return !nil && String(x) === v;
    case "neq":
      return !nil && String(x) !== v;
    case "is":
      return v === "null" ? nil : String(x) === v;
    case "lt":
      return !nil && compare(x, v) < 0;
    case "gt":
      return !nil && compare(x, v) > 0;
    case "in":
      return !nil && splitTop(raw.replace(/^\(|\)$/g, "")).map(unquote).includes(String(x));
    default:
      throw new Error(`fake postgrest: unsupported operator ${op}`);
  }
}

const RESERVED = new Set(["select", "on_conflict", "limit", "order", "columns", "offset"]);

function matches(row: Row, q: URLSearchParams) {
  for (const [key, value] of q.entries()) {
    if (RESERVED.has(key)) continue;
    if (key === "or") {
      const any = splitTop(value.replace(/^\(|\)$/g, "")).some((clause) => {
        const [col, ...rest] = clause.split(".");
        return test(row, col, rest.join("."));
      });
      if (!any) return false;
    } else if (!test(row, key, value)) {
      return false;
    }
  }
  return true;
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createFakeClient(db: FakeDb) {
  let seq = 0;
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const q = url.searchParams;
    const path = url.pathname.replace("/rest/v1/", "");
    db.log.push({ method, path, query: Object.fromEntries(q.entries()), body });

    const headers = new Headers(init.headers);
    const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const wantsRows = q.has("select") || (headers.get("prefer") ?? "").includes("return=representation");

    if (path.startsWith("rpc/")) {
      const user = (db.tables.users ?? []).find((r) => r.id === body.p_user_id) as { credits_balance: number } | undefined;
      if (path === "rpc/deduct_user_credits") {
        if (!user || user.credits_balance < body.p_amount) return json(200, false);
        user.credits_balance -= body.p_amount;
        return json(200, true);
      }
      if (path === "rpc/add_user_credits" && user) {
        user.credits_balance += body.p_amount;
        return json(200, user.credits_balance);
      }
      throw new Error(`fake postgrest: unhandled rpc ${path}`);
    }

    const table = (db.tables[path] ??= []);
    const project = (rows: Row[]) => {
      const sel = q.get("select");
      if (!sel || sel === "*") return rows;
      const cols = sel.split(",").map((c) => c.trim());
      return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
    };
    const respond = (rows: Row[], status = 200) => {
      if (!wantsRows && method !== "GET") return new Response(null, { status: 204 });
      const out = project(rows);
      if (single) {
        return out.length === 1
          ? json(200, out[0])
          : json(406, { code: "PGRST116", details: `The result contains ${out.length} rows`, message: "JSON object requested, multiple (or no) rows returned" });
      }
      return json(status, out);
    };

    if (method === "GET") {
      const rows = table.filter((r) => matches(r, q));
      return respond(q.get("limit") ? rows.slice(0, Number(q.get("limit"))) : rows);
    }
    if (method === "POST") {
      const items = (Array.isArray(body) ? body : [body]).map((b: Row) => ({
        id: b.id ?? `${path}-${++seq}`,
        created_at: new Date().toISOString(),
        ...b,
      }));
      table.push(...items);
      return respond(items, 201);
    }
    if (method === "PATCH") {
      const rows = table.filter((r) => matches(r, q));
      rows.forEach((r) => Object.assign(r, body));
      return respond(rows);
    }
    if (method === "DELETE") {
      const rows = table.filter((r) => matches(r, q));
      db.tables[path] = table.filter((r) => !rows.includes(r));
      return respond(rows);
    }
    throw new Error(`fake postgrest: unhandled ${method} ${path}`);
  };

  return createClient<Database>("http://fake.supabase.test", "service-role-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });
}

/** Short "METHOD table" lines for the writes in the log (reads skipped). */
export function writes(db: FakeDb) {
  return db.log.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`);
}
