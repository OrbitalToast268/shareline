import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class", // only dark if we explicitly add class="dark" (we won't)
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;