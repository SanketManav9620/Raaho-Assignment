import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_PROXY_TARGET || 'http://localhost:4000';

  // The browser calls /trips on the Vite server and Vite forwards it to the API.
  // Same origin for the browser = no CORS, whichever port Vite ends up on
  // (5173 is often taken, and Vite silently moves to 5174, 5175, ...).
  const proxy = { '/trips': apiTarget, '/health': apiTarget };

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { proxy },
  };
});
