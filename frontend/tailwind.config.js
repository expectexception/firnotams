/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'notam-bg': '#0f172a',
                'notam-surface': '#1e293b',
                'notam-border': '#334155',
                'notam-green': '#16a34a',
                'notam-orange': '#d97706',
                'notam-red': '#dc2626',
                'notam-unknown': '#475569',
                'notam-text': '#e2e8f0',
                'notam-muted': '#94a3b8',
            },
            fontFamily: {
                sans: ['Outfit', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }
        },
    },
    plugins: [],
}
