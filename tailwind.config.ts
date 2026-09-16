import type { Config } from "tailwindcss"

/** Brand tokens mirror the platform so the two apps read as one system. */
const config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: "#121212",
        "steel-grey": "#5A5A5A",
        "industrial-blue": "#1F6FD6",
        "deep-navy": "#0A4D78",
        "sun-yellow": "#F2B705",
        "burnt-orange": "#C56F00",
        paper: "#FCFBF9",
        hairline: "#E5E3DE",
      },
      fontFamily: {
        sans: ["Inter", "Roboto", "system-ui", "sans-serif"],
        heading: ["Montserrat", "Poppins", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
