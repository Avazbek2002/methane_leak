import { Inter } from "next/font/google";
import "./globals.css";
import 'mapbox-gl/dist/mapbox-gl.css';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata = {
  title: "MethaneLeak | Interactive Methane Plume Visualization Dashboard",
  description: "Monitor real-time methane plume anomalies and facility emission vectors using high-resolution PostGIS geospatial data and Mapbox GL satellite imagery.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
