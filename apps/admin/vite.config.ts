import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { version } from '../../package.json';
export default defineConfig({ define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) }, base: process.env.VITE_ANDROID_BUILD ? '/__app/' : './', plugins: [react()], server: { port: 5173 } });
