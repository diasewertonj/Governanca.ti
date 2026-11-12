/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          // Fase 7: bibliotecas em arquivos próprios (cache do navegador entre deploys)
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
              { name: 'icones', test: /node_modules[\\/]lucide-react[\\/]/ },
            ],
          },
        },
      },
    },
    test: {
      // Testes unitários (npm test). Os de banco ficam em scripts/test-db.mjs.
      include: ['src/**/*.test.ts'],
    },
  };
});
