import { AuthManager } from './auth-manager.js';
import Toast from './utils/toast.js';

class DashboardAuth {
    constructor(requiredUserType = null) {
        this.requiredUserType = requiredUserType;
        this.currentUser = null;
        
        this.init();
    }

    async init() {
        await this.checkAuthentication();
        this.setupUI();
    }

    async checkAuthentication() {
        const isAuthenticated = await AuthManager.requireAuth(this.requiredUserType);
        
        if (!isAuthenticated) {
            return;
        }

        this.currentUser = AuthManager.getCurrentUser();
        this.updateUserInterface();
    }

    setupUI() {
        // Add logout functionality
        const logoutButtons = document.querySelectorAll('[data-logout]');
        logoutButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                AuthManager.logout();
            });
        });

        // Update user profile in UI
        this.updateUserProfile();
    }

    updateUserInterface() {
        if (!this.currentUser) return;

        // Update page title with user info
        if (this.currentUser.type === 'partner') {
            document.title = `${this.currentUser.data.company_name} - Cryptware Partner`;
        } else if (this.currentUser.type === 'internal') {
            document.title = `${this.currentUser.data.name} - Cryptware Internal`;
        }

        // Update any user-specific UI elements
        const userElements = document.querySelectorAll('[data-user]');
        userElements.forEach(element => {
            const attribute = element.getAttribute('data-user');
            if (attribute === 'name') {
                element.textContent = this.currentUser.data.name || this.currentUser.data.company_name;
            } else if (attribute === 'email') {
                element.textContent = this.currentUser.data.email;
            } else if (attribute === 'role') {
                element.textContent = this.currentUser.data.role || 'Partner';
            }
        });
    }

    updateUserProfile() {
        // Update profile picture, name, etc.
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const profileRole = document.getElementById('profileRole');

        if (profileName && this.currentUser) {
            profileName.textContent = this.currentUser.data.name || this.currentUser.data.company_name;
        }
        if (profileEmail && this.currentUser) {
            profileEmail.textContent = this.currentUser.data.email;
        }
        if (profileRole && this.currentUser) {
            profileRole.textContent = this.currentUser.data.role || 'Partner';
        }
    }

    // Check if user has specific role (for internal users)
    hasRole(requiredRole) {
        if (!this.currentUser || this.currentUser.type !== 'internal') {
            return false;
        }
        return this.currentUser.data.role === requiredRole;
    }

    // Get user ID for API calls
    getUserId() {
        return this.currentUser?.data?.id;
    }
}

// Initialize based on page
document.addEventListener('DOMContentLoaded', async () => {
    const body = document.body;
    
    if (body.classList.contains('partner-dashboard')) {
        window.dashboardAuth = new DashboardAuth('partner');
    } else if (body.classList.contains('internal-dashboard')) {
        window.dashboardAuth = new DashboardAuth('internal');
    } else {
        window.dashboardAuth = new DashboardAuth();
    }
});

export default DashboardAuth;