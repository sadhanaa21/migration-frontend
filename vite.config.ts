import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const coreApiUrl = env.VITE_CORE_API_URL || "http://127.0.0.1:8010";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: coreApiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
