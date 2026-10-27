"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, options: { sitekey: string; theme?: "dark" | "light" | "auto" }) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the captcha"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile checkbox for the auth forms. It adds a hidden
 * `cf-turnstile-response` field to the surrounding <form>, which the auth
 * actions pass to Supabase as `captchaToken` (Supabase verifies it once
 * captcha protection is enabled there). Renders nothing until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Change `resetKey` after a failed
 * submit: tokens are single-use.
 */
export function Turnstile({ resetKey }: { resetKey?: unknown }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, { sitekey: SITE_KEY, theme: "dark" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="flex min-h-[65px] justify-center" />;
}
