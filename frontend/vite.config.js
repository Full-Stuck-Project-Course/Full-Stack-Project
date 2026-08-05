import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const backendTarget = env.DEV_BACKEND_TARGET || "http://127.0.0.1:5000";

    return {
        plugins: [react()],
        server: {
            port: 3000,
            proxy: {
                "/api": {
                    target: backendTarget,
                    changeOrigin: true
                },
                "/socket.io": {
                    target: backendTarget,
                    changeOrigin: true,
                    ws: true
                },
                "/uploads": {
                    target: backendTarget,
                    changeOrigin: true
                }
            }
        }
    };
});
