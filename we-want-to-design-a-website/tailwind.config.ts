import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#251735",
        paper: "#FFF9F3",
        cyan: "#08B8D0",
        violet: "#8A5CF6",
        pink: "#F04E98",
        coral: "#FF6B58",
        mango: "#FFB000",
        amber: "#F59E0B",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(37,23,53,.08)",
      },
    },
  },
  plugins: [],
};
export default config;
