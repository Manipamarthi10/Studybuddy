/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Clash Display'", "sans-serif"],
        body: ["'Cabinet Grotesk'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        byjus: {
          purple: "#6B4CE8",
          blue: "#1F7EDB",
          orange: "#FF6B35",
          lightPurple: "#F3EFFE",
          lightBlue: "#EFF5FF",
        },
        ink: {
          DEFAULT: "#FFFFFF",
          soft: "#F8F9FA",
          muted: "#E8EAED",
        },
        jade: {
          DEFAULT: "#6B4CE8",
          dim: "#5A3DD1",
          glow: "rgba(107,76,232,0.15)",
        },
        amber: {
          ai: "#FF6B35",
        },
        slate: {
          ai: "#757575",
        },
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease forwards",
        "pulse-jade": "pulseJade 2s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
        shimmer: "shimmer 1.5s linear infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: 0, transform: "translateY(16px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        pulseJade: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0,229,160,0)" },
          "50%": { boxShadow: "0 0 20px 4px rgba(0,229,160,0.3)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
