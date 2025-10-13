import { supabase } from './supabase-client.js';
import { CONFIG, apiClient } from './config.js';
import Toast from './utils/toast.js';

export class AuthManager {

    

    // Unified login for both partners and internal users
    static async login(email, password, userType = 'auto') {
    try {
        console.log(`🔐 Attempting login for: ${email}`);
        
        const response = await apiClient.post(CONFIG.API.ENDPOINTS.AUTH.LOGIN, {
            email: email.trim().toLowerCase(),
            password: password
        });

        if (response.data.success) {
            const { user, userType, session } = response.data.data;
            
            // ✅ Store the appropriate token
            if (session?.access_token) {
                localStorage.setItem('authToken', session.access_token);
                console.log('✅ Auth token stored:', session.access_token.substring(0, 20) + '...');
            } else {
                console.warn('⚠️ No access token in response');
            }
            
            // Store user based on type
            if (userType === 'partner') {
                localStorage.setItem('currentPartner', JSON.stringify(user));
                localStorage.removeItem('internalUser');
                
                Toast.success(`Welcome back, ${user.company_name}!`);
                setTimeout(() => {
                    window.location.href = 'partner-dashboard.html';
                }, 1500);
                
            } else if (userType === 'internal') {
                localStorage.setItem('internalUser', JSON.stringify(user));
                localStorage.removeItem('currentPartner');
                
                Toast.success(`Welcome back, ${user.name}!`);
                setTimeout(() => {
                    window.location.href = 'internal-dashboard.html';
                }, 1500);
            }
            
            return { success: true, user, userType };
        } else {
            throw new Error(response.data.message || 'Login failed');
        }
        
    } catch (error) {
        console.error('💥 Login error:', error);
        
        let errorMessage = 'An unexpected error occurred. Please try again.';
        
        if (error.response) {
            errorMessage = error.response.data?.message || errorMessage;
        } else if (error.message) {
            errorMessage = error.message;
        }

        Toast.error(errorMessage);
        return { success: false, error: errorMessage };
    }
}

    // Partner-specific login (legacy support)
    static async partnerLogin(email, password) {
        return this.login(email, password, 'partner');
    }

    // Internal-specific login (legacy support)
    static async internalLogin(email, password) {
        return this.login(email, password, 'internal');
    }

    // Get current user profile from backend
    static async getCurrentUserProfile() {
        try {
            const response = await apiClient.get(CONFIG.API.ENDPOINTS.AUTH.ME);
            
            if (response.data.success) {
                const { user, userType } = response.data.data;
                
                // Update localStorage with fresh data
                if (userType === 'partner') {
                    localStorage.setItem('currentPartner', JSON.stringify(user));
                } else if (userType === 'internal') {
                    localStorage.setItem('internalUser', JSON.stringify(user));
                }
                
                return { success: true, user, userType };
            } else {
                throw new Error('Failed to fetch user profile');
            }
        } catch (error) {
            console.error('Get profile error:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if user is authenticated
    static async checkAuth() {
        try {
            // Check if we have a token
            const token = localStorage.getItem('authToken');
            if (!token) {
                return false;
            }

            // Verify token is still valid by making a simple API call
            const response = await apiClient.get(CONFIG.API.ENDPOINTS.AUTH.ME);
            return response.data.success;
            
        } catch (error) {
            console.error('Auth check error:', error);
            // Clear invalid token
            if (error.response?.status === 401) {
                this.clearAuth();
            }
            return false;
        }
    }

    // Clear all auth data
    static clearAuth() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentPartner');
        localStorage.removeItem('internalUser');
        localStorage.removeItem('currentUser');
    }

    // Logout
    static async logout() {
        try {
            // Call backend logout if needed
            await apiClient.post(CONFIG.API.ENDPOINTS.AUTH.LOGOUT);
        } catch (error) {
            console.error('Logout API error:', error);
        } finally {
            // Always clear local storage
            this.clearAuth();
            
            Toast.success('👋 Logged out successfully');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
        }
    }

    // Get current user from localStorage
    static getCurrentUser() {
        // Check internal user first
        const internalUser = localStorage.getItem('internalUser');
        if (internalUser) {
            try {
                return { type: 'internal', data: JSON.parse(internalUser) };
            } catch (e) {
                localStorage.removeItem('internalUser');
            }
        }
        
        // Check partner
        const partner = localStorage.getItem('currentPartner');
        if (partner) {
            try {
                return { type: 'partner', data: JSON.parse(partner) };
            } catch (e) {
                localStorage.removeItem('currentPartner');
            }
        }
        
        return null;
    }

    // Check and redirect if not authenticated
    static async requireAuth(userType = null) {
        const isAuthenticated = await this.checkAuth();
        const currentUser = this.getCurrentUser();
        
        if (!isAuthenticated) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
            return false;
        }

        // Specific user type requirement
        if (userType === 'internal' && currentUser?.type !== 'internal') {
            window.location.href = 'login.html';
            return false;
        }

        if (userType === 'partner' && currentUser?.type !== 'partner') {
            window.location.href = 'login.html';
            return false;
        }

        return true;
    }

    // Forgot password
    static async forgotPassword(email) {
        try {
            const response = await apiClient.post(CONFIG.API.ENDPOINTS.AUTH.FORGOT_PASSWORD, {
                email: email.trim().toLowerCase()
            });

            if (response.data.success) {
                Toast.success('📧 Check your email for password reset instructions');
                return { success: true };
            } else {
                throw new Error(response.data.message || 'Failed to send reset email');
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to send reset instructions';
            Toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Reset password
    static async resetPassword(token, newPassword) {
        try {
            const response = await apiClient.post(CONFIG.API.ENDPOINTS.AUTH.RESET_PASSWORD, {
                token: token,
                newPassword: newPassword
            });

            if (response.data.success) {
                Toast.success('✅ Password reset successfully! You can now login with your new password.');
                return { success: true };
            } else {
                throw new Error(response.data.message || 'Failed to reset password');
            }
        } catch (error) {
            console.error('Reset password error:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Failed to reset password';
            Toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Validate email format
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validate password strength
    static isStrongPassword(password) {
        return password.length >= 8;
    }

    // Get friendly auth error messages
    static getFriendlyAuthError(error) {
        const errorMap = {
            'Invalid login credentials': 'Invalid email or password. Please try again.',
            'Email not confirmed': 'Please verify your email address before logging in.',
            'Invalid email or password': 'Invalid email or password. Please try again.',
            'User not found': 'No account found with this email address.',
            'Too many requests': 'Too many login attempts. Please try again in a few minutes.',
            'Network request failed': 'Network error. Please check your internet connection.'
        };
        
        return errorMap[error.message] || error.message || 'Login failed. Please try again.';
    }
}

// Make AuthManager available globally
window.AuthManager = AuthManager;