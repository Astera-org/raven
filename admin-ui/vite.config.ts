import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_BACKEND_URL || "http://localhost:7001";
  const frontendUrl = env.VITE_FRONTEND_URL || undefined;

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "./app"),
      },
    },
    server: {
      host: "::",
      port: 3003,
      open: env.VITE_DEV_OPEN === "true",
      allowedHosts: env.VITE_ALLOWED_HOSTS
        ? env.VITE_ALLOWED_HOSTS.split(",")
        : ["thestacks.org"],
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    optimizeDeps: {
      entries: ["app/**/*.{ts,tsx}"], // find app dependencies before the first page load
      include: ["react", "react-dom", "react-hook-form"],
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_MODE__: JSON.stringify(mode),
      __API_BACKEND_URL__: JSON.stringify(backendUrl),
      __API_FRONTEND_URL__: JSON.stringify(frontendUrl),
    },
  };
});
