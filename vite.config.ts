/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Versão do produto derivada do git em build-time: cada commit gera uma versão
// nova automaticamente (1.0.<contagem de commits>). O try/catch garante que o
// build NUNCA quebra se o git não estiver disponível (fallback 'dev'/'unknown').
// Nota: no CI (actions/checkout com fetch-depth 1, clone raso) `git rev-list
// --count HEAD` retorna 1 — aceitável para o propósito de identificar o build.
function gitOutput(command: string, fallback: string): string {
  try {
    return execSync(command, { encoding: 'utf8' }).trim() || fallback
  } catch {
    return fallback
  }
}

const commitCount = gitOutput('git rev-list --count HEAD', '')
const appVersion = commitCount ? `1.0.${commitCount}` : 'dev'
const appCommit = gitOutput('git rev-parse --short HEAD', 'unknown')
const appBuildDate = new Date().toISOString().slice(0, 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Globals declarados em src/vite-env.d.ts. Como o config do Vitest vive neste
  // mesmo arquivo, o `define` também vale para os testes.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_BUILD_DATE__: JSON.stringify(appBuildDate),
  },
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
