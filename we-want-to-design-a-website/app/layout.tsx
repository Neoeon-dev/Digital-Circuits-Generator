import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogicFlow | Digital Logic Studio",
  description: "Turn Boolean logic into clear circuit implementations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
