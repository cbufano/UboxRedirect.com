/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // O monorepo tem um segundo projeto de testes independente em mobile/ (Jest/jest-expo,
    // ver mobile/jest.config.js) — sem este exclude, o padrão default do Vitest varre o
    // repo inteiro e tenta (e falha) transformar módulos React Native/Flow de mobile/.
    exclude: ['**/node_modules/**', '**/dist/**', 'mobile/**'],
    // Padrão do Vitest (5000ms) já se mostrou apertado para páginas de auth
    // que preenchem vários campos com userEvent + mocks assíncronos.
    testTimeout: 10000,
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
