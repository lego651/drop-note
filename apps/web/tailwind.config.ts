import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class', 'class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			'destructive-text': 'hsl(var(--destructive-text))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			success: 'hsl(var(--color-success))',
  			canvas: 'hsl(var(--content-bg))',
  			ink: 'hsl(var(--ink))',
  			link: 'hsl(var(--link))',
  			overlay: 'hsl(var(--overlay))',
  			chart: {
  				'1': 'hsl(var(--color-chart-1))',
  				'2': 'hsl(var(--color-chart-2))',
  				'3': 'hsl(var(--color-chart-3))',
  				'4': 'hsl(var(--color-chart-4))'
  			}
  		},
  		fontFamily: {
  			sans: ['var(--font-sans)'],
  			display: ['var(--font-display)'],
  			mono: ['var(--font-mono)']
  		},
  		borderWidth: {
  			stroke: 'var(--stroke)'
  		},
  		boxShadow: {
  			'ink-sm': 'var(--shadow-sm)',
  			'ink-md': 'var(--shadow-md)',
  			'ink-lg': 'var(--shadow-lg)',
  			'ink-hover': 'var(--shadow-hover)'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [],
}
export default config
