import { ImageResponse } from "next/og";

export const alt = "KomaMotion AI — Manga panels to cinematic video";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card, rendered at build time. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "radial-gradient(ellipse at top, #4c1d95 0%, #09090b 65%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, color: "#c4b5fd", letterSpacing: 4 }}>A NEXULYS SAAS</div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 16 }}>KomaMotion AI</div>
        <div style={{ fontSize: 40, color: "#d4d4d8", marginTop: 12 }}>Turn manga panels into cinematic video.</div>
      </div>
    ),
    size
  );
}
