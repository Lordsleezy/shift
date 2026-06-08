module.exports = {
  content: ["./index.html", "./src/renderer/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      colors: {
        shift: {
          navy: "#1a1f3a",
          accent: "#4f8ef7"
        }
      },
      boxShadow: {
        glow: "0 0 38px rgba(79, 142, 247, 0.22)"
      }
    }
  },
  plugins: []
};
