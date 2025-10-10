

// Frontend Configuration - Production Ready
export const CONFIG = {
    // Supabase Configuration
    SUPABASE: {
        URL: 'https://hfemxnmhkvtaqgoshaym.supabase.co',
        ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZW14bm1oa3Z0YXFnb3NoYXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NDg3NzgsImV4cCI6MjA3MDMyNDc3OH0.O2hcYkYN3bMSCdMxRWmXolvWjdcFcPk-ORNLG9OYZvs'
    },
    
    // API Configuration
    API: {
        BASE_URL: 'http://localhost:8000/api',
        TIMEOUT: 30000,
        ENDPOINTS: {
            AUTH: {
                REGISTER: '/auth/register',
                SEND_OTP: '/auth/send-otp',
                VERIFY_OTP: '/auth/verify-otp',
                PARTNER_LOGIN: '/auth/partner-login', 
                INTERNAL_LOGIN: '/auth/internal-login', 
                FORGOT_PASSWORD: '/auth/forgot-password',
                RESET_PASSWORD: '/auth/reset-password',
                LOGOUT: '/auth/logout'
            },
            BANK: {
                VERIFY: '/bank/verify',
                LIST: '/bank/list',
                UPDATE_PARTNER: '/bank/update-partner'
            },
            REFERRALS: {
                CREATE: '/referrals/create',
                LIST: '/referrals',
                STATS: '/referrals/stats'
            },
            PARTNER: {
                DASHBOARD: '/partner/dashboard',
                PROFILE: '/partner/profile',
                PAYOUTS: '/partner/payouts'
            },
            INTERNAL: {
                DASHBOARD: '/internal/dashboard',
                LEADS: '/internal/leads',
                PAYMENTS: '/internal/payments'
            }
        }
    },
    
    // Business Configuration
    COMMISSION_RATE: 0.05, // 5%
    CURRENCY: '₦',
    PAYOUT_THRESHOLD: 0, // No minimum threshold
    
    // UI Configuration
    THEME: {
        PRIMARY: '#2563eb',
        SUCCESS: '#10b981',
        WARNING: '#f59e0b',
        ERROR: '#ef4444'
    },
    
    // Feature Flags
    FEATURES: {
        BANK_VERIFICATION: true,
        OTP_VERIFICATION: true,
        REAL_TIME_UPDATES: true
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


export const apiClient = axios.create({
    baseURL: CONFIG.API.BASE_URL,
    timeout: CONFIG.API.TIMEOUT,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor
apiClient.interceptors.request.use(
    (config) => {
        console.log(`🚀 API Call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
apiClient.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
    }
);