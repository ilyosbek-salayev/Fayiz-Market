import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: process.env.VITE_ANDROID_BUILD ? '/__app/' : './', plugins: [react()], server: { port: 5173 } });
