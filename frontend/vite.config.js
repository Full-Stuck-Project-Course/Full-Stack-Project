import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = "http://127.0.0.1:5000";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        proxy: {
            "/api": {
                target: API_TARGET,
                changeOrigin: true
            }
        }
    }
});
