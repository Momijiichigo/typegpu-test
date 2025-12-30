import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import devtools from 'solid-devtools/vite';
import typegpuPlugin from 'unplugin-typegpu/vite'

export default defineConfig({
  plugins: [devtools(), solidPlugin(), tailwindcss(), typegpuPlugin({})],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
