import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LogicFlow | Digital Logic Studio", template: "%s | LogicFlow" },
  description: "A visual digital-logic workbench for synthesis, probing, circuit experiments and display decoding.",
  applicationName: "LogicFlow",
  themeColor: "#FFF9F3",
};

const themeInit = `(() => {
  try {
    const key = "logicflow-theme";
    const saved = localStorage.getItem(key);
    const theme = saved === "dark" || saved === "light"
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.logicflowTheme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
