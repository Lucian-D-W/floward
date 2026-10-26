import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],optimizeDeps:{entries:['index.html']},server:{port:1420,strictPort:true,watch:{ignored:['**/archive/**','**/vendor/**','**/src-tauri/**','**/release/**']}},build:{target:'es2022'}});
