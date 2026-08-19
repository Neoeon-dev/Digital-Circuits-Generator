import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#251735",
        paper: "#FFF9F3",
        cyan: "#08B8D0",
        violet: "#8A5CF6",
        coral: "#FF6B58",
        mango: "#FFB000",
        pink: "#F04E98",
      },
      boxShadow: { panel: "0 18px 50px rgba(30, 45, 69, 0.08)" },
    },
  },
  plugins: [],
};

export default config;
