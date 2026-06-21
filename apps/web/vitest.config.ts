import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', '../../tests/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@foreign-trade': path.resolve(__dirname, '../../industry-packs/foreign-trade/src'),
      'bcryptjs': path.resolve(__dirname, './node_modules/bcryptjs'),
    },
  },
  server: {
    deps: {
      external: ['next-auth', '@auth/prisma-adapter'],
      inline: ['@hermesclaw/event-contracts', '@hermesclaw/hermes-kernel', 'bcryptjs'],
    },
  },
})
