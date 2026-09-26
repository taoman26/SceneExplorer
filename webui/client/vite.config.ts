import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api is proxied to the WebUI server (npm start in ../server).
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', proxy: { '/api': 'http://127.0.0.1:8686' } },
});
