import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').pop();
  const base = process.env.VITE_BASE_PATH || (repositoryName ? `/${repositoryName}/` : '/');

  return {
    base,
    plugins: [
      react(),
      {
        name: 'wasm-content-type',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.includes('.wasm')) {
              res.setHeader('Content-Type', 'application/wasm');
            }
            next();
          });
        },
      },
    ],
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['@lynx-js/animax', '@lynx-js/animax-textra', '@lynx-js/animax-video'],
    },
    build: {
      sourcemap: true,
    },
  };
});
