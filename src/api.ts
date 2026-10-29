import {t, content, msg} from "./i18n";
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {throw new Error(t("The lanterns flickered. Please try again."));});
  const data = await res.json().catch(() => {throw new Error(t("The lanterns flickered. Please try again."));});
  if (!res.ok) {
    const shortage=String(data.error).match(/^You need (\d+) more candies\. A lantern duel can help\.$/);
    throw new Error(shortage ? msg`You need ${shortage[1]} more candies. A lantern duel can help.` : t(data.error || "The lanterns flickered. Please try again."));
  }
  return path === "/catalog" || /^\/spirits\/[^/]+\/story$/.test(path) ? content(data) : data;
}
export const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function event(name: string, detail = "") {
  void api("/events", { event: name, detail }).catch(() => {});
}
