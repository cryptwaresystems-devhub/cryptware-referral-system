import { supabase } from './supabase-client.js';
import { CONFIG, apiClient } from './config.js';
import Toast from './utils/toast.js';

export class AuthManager {
    // Check if user is authenticated
    static async checkAuth() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) {
                console.error('Auth check error:', error);
                return null;
            }
            
            return session;
        } catch (error) {
            console.error('Auth check failed:', error);
            return null;
        }
    }

    // Partner login with Supabase Auth
    static async partnerLogin(email, password) {
        try {
            console.log('🔐 Attempting partner login for:', email);
            
            const response = await apiClient.post(CONFIG.API.ENDPOINTS.AUTH.PARTNER_LOGIN, {
                email: email.trim().toLowerCase(),
                password: password
            });

            if (response.data.success) {
                // Store partner in localStorage
                localStorage.setItem('currentPartner', JSON.stringify(response.data.data));
                
                Toast.success(`Welcome back, ${response.data.data.company_name}! Redirecting...`);
                
                setTimeout(() => {
                    window.location.href = 'partner-dashboard.html';
                }, 1500);
                
                return { success: true, data: response.data.data };
            } else {
                throw new Error(response.data.message || 'Login failed');
            }
            
        } catch (error) {
            console.error('💥 Partner login error:', error);
            
            let errorMessage = 'An unexpected error occurred. Please try again.';
            
            if (error.response) {
                switch (error.response.status) {
                    case 401:
                        errorMessage = 'Invalid email or password. Please try again.';
                        break;
                    case 403:
                        errorMessage = 'Your account has been suspended. Please contact support.';
                        break;
                    case 404:
                        errorMessage = 'Account not found. Please check your credentials.';
                        break;
                    case 429:
                        errorMessage = 'Too many login attempts. Please try again later.';
                        break;
                    case 500:
                        errorMessage = 'Server error. Please try again later.';
                        break;
                    default:
                        errorMessage = error.response.data?.message || errorMessage;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            Toast.error(errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Internal user login
    static async internalLogin(email, password) {
        try {
        console.log('🔐 Attempting internal login for:', email);
        
        const response = await apiClient.post(CONFIG.API.ENDPOINTS.AUTH.INTERNAL_LOGIN, {
            email: email.trim().toLowerCase(),
            password: password
        });
    
        if (response.data.success) {
            // Store internal user session
            localStorage.setItem('internalUser', JSON.stringify(response.data.data));
            
            Toast.success('Welcome back! Redirecting to internal dashboard...');
            
            // Smooth redirect
            setTimeout(() => {
            window.location.href = 'internal-dashboard.html';
            }, 1500);
            
            return { success: true, data: response.data.data };
        } else {
            throw new Error(response.data.message || 'Login failed');
        }
        } catch (error) {
        console.error('Internal login error:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Login failed. Please check your credentials.';
        Toast.error(errorMessage);
        return { success: false, error: errorMessage };
        }
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

    // Logout
    static async logout() {
        try {
            const { error } = await supabase.auth.signOut();
            localStorage.removeItem('internalUser');
            localStorage.removeItem('currentPartner');
            
            if (error) throw error;
            
            Toast.success('👋 Logged out successfully');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
        } catch (error) {
            console.error('Logout error:', error);
            // Force logout anyway
            localStorage.removeItem('internalUser');
            localStorage.removeItem('currentPartner');
            window.location.href = 'login.html';
        }
    }

    // Get current user
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
        const currentUser = this.getCurrentUser();
        const session = await this.checkAuth();
        
        const isAuthenticated = currentUser || session;
        
        if (!isAuthenticated) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
            return false;
        }

        if (userType === 'internal' && currentUser?.type !== 'internal') {
            window.location.href = 'login.html';
            return false;
        }

        if (userType === 'partner' && !session && currentUser?.type !== 'partner') {
            window.location.href = 'login.html';
            return false;
        }

        return true;
    }

    // Get friendly auth error messages
    static getFriendlyAuthError(error) {
        const errorMap = {
            'Invalid login credentials': 'Invalid email or password. Please try again.',
            'Email not confirmed': 'Please verify your email address before logging in. Check your inbox for the verification link.',
            'Invalid email or password': 'Invalid email or password. Please try again.',
            'User not found': 'No account found with this email address.',
            'Too many requests': 'Too many login attempts. Please try again in a few minutes.',
            'Network request failed': 'Network error. Please check your internet connection.'
        };
        
        return errorMap[error.message] || error.message || 'Login failed. Please try again.';
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
}

// Make AuthManager available globally
window.AuthManager = AuthManager;