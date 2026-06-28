import { defineConfig } from 'vite';

// https://vitejs.dev/config/
const bypassHtml = (req: { headers: Record<string, string | string[] | undefined> }) => {
  const accept = req.headers.accept;
  if (accept && typeof accept === 'string' && accept.includes('text/html')) {
    return '/index.html';
  }
};

export default defineConfig({
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      ignored: [
        '**/.git/**',
        '**/.local-tools/**',
        '**/.local-data/**',
        '**/backend/venv/**',
        '**/backend/.venv/**',
        '**/data/**',
        '**/dist/**',
        '**/logs/**',
      ],
    },

    allowedHosts: [
      'candela.exam',
      'exam.local',
      '192.168.200.51'
    ],
    proxy: {
      '/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/assessments': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/questions': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/question': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/testcases': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/candidate': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/results': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/mcq': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: bypassHtml,
      },
      '/run': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/submit': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
