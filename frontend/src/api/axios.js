// src/api/axios.js

import axios from "axios";
import { API_BASE_URL } from "./config";

const api = axios.create({
    baseURL: API_BASE_URL
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401 && !err.config?.skipAuthRedirect) {
            localStorage.removeItem("token");
            window.location.href = "/login";
        }
        return Promise.reject(err);
    }
);

export default api;
