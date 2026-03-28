import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Unity Editor dark theme — exact values
        u: {
          toolbar:    '#191919',  // app toolbar / titlebar
          bg:         '#282828',  // default panel background
          header:     '#3C3C3C',  // panel headers, inspector titlebars
          input:      '#2A2A2A',  // input fields
          hover:      '#3C3C3C',  // hover on list items
          btn:        '#585858',  // button background
          'btn-hov':  '#676767',  // button hover
          'btn-act':  '#46607C',  // button active/pressed
          'btn-bdr':  '#303030',  // button border
          border:     '#3A3A3A',  // default borders
          text:       '#D2D2D2',  // default text
          label:      '#C4C4C4',  // labels
          muted:      '#888888',  // muted/hint
          'btn-txt':  '#EEEEEE',  // button text
          sel:        '#2C5D87',  // selection highlight
          link:       '#4C7EFF',  // links
          accent:     '#3d85c8',  // interactive accent
        },
      },
      fontFamily: {
        sans: ['Cascadia Code', 'Cascadia Mono', 'Consolas', 'monospace'],
        mono: ['Cascadia Code', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        'unity': ['12px', { lineHeight: '18px' }],  // Unity standard control size
      },
    },
  },
  plugins: [typography],
}
