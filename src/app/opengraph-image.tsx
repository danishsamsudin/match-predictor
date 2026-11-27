import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";

export const runtime = "edge";
export const alt = `${BRAND_NAME} - Dynamic match intelligence`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: "linear-gradient(135deg, #0c1222 0%, #155e75 55%, #0e7490 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: 4, opacity: 0.85 }}>
          DYNAMIC MATCH INTELLIGENCE
        </div>
        <div style={{ marginTop: 24, fontSize: 72, fontWeight: 700 }}>{BRAND_NAME}</div>
        <div style={{ marginTop: 20, maxWidth: 900, fontSize: 32, lineHeight: 1.35, opacity: 0.92 }}>
          Win probabilities, fair odds, and Value Opportunities across five club leagues.
        </div>
      </div>
    ),
    { ...size }
  );
}
