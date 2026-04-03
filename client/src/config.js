// API Configuration
// In development, we use proxy in vite.config.js for '/api'
// In production (Vercel), we use relative paths or environment variables if needed.

const isDev = import.meta.env.MODE === 'development';

// For Vercel, if backend is on same domain, use relative path
export const API_BASE = '/api';

export default API_BASE;
