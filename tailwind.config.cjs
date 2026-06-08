module.exports = {
  content: ["./index.html", "./src/renderer/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      colors: {
        shift: {
          navy: "#0a1628",
          surface: "#0f172a",
          accent: "#14b8a6",
          "accent-hover": "#0d9488",
          muted: "#64748b"
        }
      },
      boxShadow: {
        glow: "0 0 38px rgba(20, 184, 166, 0.25)"
      },
      animation: {
        "screenshot-pan": "screenshot-pan 8s ease-in-out infinite"
      },
      keyframes: {
        "screenshot-pan": {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(-8%)" }
        }
      }
    }
  },
  plugins: []
};
