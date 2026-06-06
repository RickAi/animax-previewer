import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  const base = process.env.GITHUB_REPOSITORY?.endsWith('/animax_previewer')
    ? '/animax_previewer/'
    : process.env.VITE_BASE_PATH || '/';

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
      exclude: ['@animax-js/animax', '@animax-js/animax-textra', '@animax-js/animax-video'],
    },
    build: {
      sourcemap: true,
    },
  };
});
