import { ImageResponse } from "next/og";

// Static, branded link-preview card for shared /report links (WhatsApp/social).
// ponytail: no external data / no custom fonts — uses next/og's bundled default font,
// so it prerenders at build time and can't fail on request-time data.
export const alt = "Pocket Teacher — your progress report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f4ec",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", color: "#2438e0", fontSize: 36, fontWeight: 700 }}>
          Pocket Teacher
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#756e5f", fontSize: 28, letterSpacing: 3 }}>
            PROGRESS REPORT
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              color: "#1a1712",
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.1,
              marginTop: 18,
            }}
          >
            <div style={{ display: "flex" }}>See your revision,</div>
            <div style={{ display: "flex" }}>topic by topic.</div>
          </div>
        </div>
        <div style={{ display: "flex", color: "#6b655a", fontSize: 30 }}>
          A free AI tutor for Mauritian students →
        </div>
      </div>
    ),
    { ...size }
  );
}
