import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // PartyKit dev server runs on 1999; the game connects to it from the browser.
    // No proxy needed — partysocket connects directly via the host below.
  },
})
