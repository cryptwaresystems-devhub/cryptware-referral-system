// Frontend Configuration - Updated for Supabase Auth
export const CONFIG = {
    // Supabase Configuration
    SUPABASE: {
        URL: 'https://lqfukatggturgvwxwejp.supabase.co',
        ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZnVrYXRnZ3R1cmd2d3h3ZWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NjI1OTYsImV4cCI6MjA3NTIzODU5Nn0.mhz7L9hkihw38R7VlIIZoSoDADwOGil0OvD1DLQLWqw'
    },
    
    // API Configuration
    API: {
        BASE_URL: 'http://localhost:8000/api',
        TIMEOUT: 30000,
        ENDPOINTS: {
            AUTH: {
              REGISTER: '/auth/register',
              LOGIN: '/auth/login',
              SEND_OTP: '/auth/send-otp',
              VERIFY_OTP: '/auth/verify-otp',
              FORGOT_PASSWORD: '/auth/forgot-password',
              RESET_PASSWORD: '/auth/reset-password',
              LOGOUT: '/auth/logout',
              ME: '/auth/me'
            },
            BANK: {
              VERIFY: '/bank/verify',
              LIST: '/bank/list',
              UPDATE_PARTNER: '/bank/update-partner'
            },
            REFERRALS: {
              CREATE: '/referrals/create',
              LIST: '/referrals',
              STATS: '/referrals/stats/dashboard',
              BY_CODE: '/referrals/code'
            },
            PARTNER: {
              DASHBOARD: '/partner/dashboard', // This is the endpoint we're using
              PROFILE: '/partner/profile',
              COMMISSIONS: '/partner/commissions',
              PAYOUTS: '/partner/payouts'
            },
            INTERNAL: {
              DASHBOARD: '/internal/dashboard',
              LEADS: '/leads',
              PAYMENTS: '/payments',
              ANALYTICS: '/internal/analytics'
            }
          }
    },
    
    // Business Configuration
    COMMISSION_RATE: 0.05, // 5%
    CURRENCY: '₦',
    
    // UI Configuration
    THEME: {
        PRIMARY: '#2563eb',
        SUCCESS: '#10b981',
        WARNING: '#f59e0b',
        ERROR: '#ef4444'
    }
};

// Environment detection
export const ENV = {
    IS_DEVELOPMENT: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    IS_PRODUCTION: !(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
};

// Update API URL for production
if (ENV.IS_PRODUCTION) {
    CONFIG.API.BASE_URL = 'https://your-production-api.com/api';
}

// Axios client with auth header management
export const apiClient = axios.create({
    baseURL: CONFIG.API.BASE_URL,
    timeout: CONFIG.API.TIMEOUT,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
    (config) => {
        // Get token from localStorage
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log(`🔐 Adding auth token to request: ${config.url}`);
        } else {
            console.warn(`⚠️ No auth token found for request: ${config.url}`);
        }
        
        console.log(`🚀 API Call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        console.error('API Error:', {
            url: error.config?.url,
            status: error.response?.status,
            message: error.response?.data?.message || error.message
        });
        
        if (error.response?.status === 401) {
            // Token expired or invalid
            console.log('🔄 Token invalid, clearing auth data...');
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentPartner');
            localStorage.removeItem('internalUser');
            
            // Redirect to login if not already there
            if (!window.location.href.includes('login.html')) {
                Toast.error('Session expired. Please login again.');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            }
        }
        
        return Promise.reject(error);
    }
);

// Update the end of your config.js file to expose CONFIG globally
window.CONFIG = CONFIG;
window.ENV = ENV;
window.apiClient = apiClient;

console.log('✅ Config loaded:', CONFIG.API.BASE_URL);