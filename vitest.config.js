import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], test: { include: ['tests/*.spec.{js,jsx}'], environment: 'node' } });
