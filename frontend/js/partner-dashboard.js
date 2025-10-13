// partner-dashboard.js - Production Ready Partner Dashboard
import { apiClient, CONFIG } from './config.js';
import Toast from './utils/toast.js';

class PartnerDashboard {
    constructor() {
        this.currentPartner = null;
        this.dashboardData = null;
        this.commissionChart = null;
        this.init();
    }

    async init() {
        try {
            // Check authentication
            const isAuthenticated = await AuthManager.requireAuth('partner');
            if (!isAuthenticated) return;

            // Load partner data
            await this.loadPartnerData();
            
            // Load dashboard data
            await this.loadDashboardData();
            
            // Initialize charts
            this.initCharts();
            
            // Set up auto-refresh
            this.setupAutoRefresh();
            
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            Toast.error('Failed to initialize dashboard');
        }
    }

    async loadPartnerData() {
        try {
            const currentUser = AuthManager.getCurrentUser();
            if (currentUser && currentUser.type === 'partner') {
                this.currentPartner = currentUser.data;
                this.updateUIWithPartnerData();
            } else {
                // Fetch fresh partner data
                const response = await apiClient.get(CONFIG.API.ENDPOINTS.PARTNER.PROFILE);
                if (response.data.success) {
                    this.currentPartner = response.data.data.partner;
                    localStorage.setItem('currentPartner', JSON.stringify(this.currentPartner));
                    this.updateUIWithPartnerData();
                }
            }
        } catch (error) {
            console.error('Error loading partner data:', error);
        }
    }

    updateUIWithPartnerData() {
        if (!this.currentPartner) return;

        // Update company name
        const companyNameEl = document.getElementById('partnerCompanyName');
        if (companyNameEl) {
            companyNameEl.textContent = this.currentPartner.company_name;
        }

        // Update welcome message
        const welcomeMessageEl = document.getElementById('welcomeMessage');
        if (welcomeMessageEl) {
            const firstName = this.currentPartner.contact_name.split(' ')[0];
            welcomeMessageEl.textContent = `Welcome back, ${firstName}!`;
        }

        // Update avatar initials
        const avatarEl = document.getElementById('avatarInitials');
        if (avatarEl) {
            const initials = this.currentPartner.contact_name
                .split(' ')
                .map(name => name[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);
            avatarEl.innerHTML = initials;
        }
    }

    async loadDashboardData() {
        try {
            // Show loading skeleton
            document.getElementById('loadingSkeleton').classList.remove('hidden');
            document.getElementById('dashboardContent').classList.add('hidden');

            const response = await apiClient.get(CONFIG.API.ENDPOINTS.PARTNER.DASHBOARD);
            
            if (response.data.success) {
                this.dashboardData = response.data.data;
                this.updateDashboardUI();
                
                // Hide loading, show content
                document.getElementById('loadingSkeleton').classList.add('hidden');
                document.getElementById('dashboardContent').classList.remove('hidden');
            } else {
                throw new Error(response.data.message);
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            Toast.error('Failed to load dashboard data');
            document.getElementById('loadingSkeleton').classList.add('hidden');
        }
    }

    updateDashboardUI() {
        if (!this.dashboardData) return;

        const { overview, referrals_breakdown, recent_referrals, monthly_trend, quick_actions } = this.dashboardData;

        // Update key metrics
        this.updateMetric('totalReferrals', overview.total_referrals);
        this.updateMetric('activeReferrals', overview.active_referrals);
        this.updateMetric('totalCommission', this.formatCurrency(overview.total_commission_earned));
        this.updateMetric('availablePayout', this.formatCurrency(overview.available_for_payout));

        // Update referral breakdown
        this.updateMetric('countCodeSent', referrals_breakdown.code_sent);
        this.updateMetric('countContacted', referrals_breakdown.contacted);
        this.updateMetric('countInProgress', 
            referrals_breakdown.meeting_scheduled + 
            referrals_breakdown.proposal_sent + 
            referrals_breakdown.negotiation
        );
        this.updateMetric('countConverted', referrals_breakdown.fully_paid);

        // Calculate and update conversion rate
        const totalCompleted = referrals_breakdown.won + referrals_breakdown.fully_paid + referrals_breakdown.lost;
        const conversionRate = totalCompleted > 0 ? 
            Math.round((referrals_breakdown.fully_paid / totalCompleted) * 100) : 0;
        this.updateMetric('conversionRate', `${conversionRate}%`);

        // Update recent referrals
        this.updateRecentReferrals(recent_referrals);

        // Update payout button state
        this.updatePayoutButton(quick_actions.can_request_payout);

        // Update performance tier
        this.updatePerformanceTier(overview.total_referrals);

        // Update chart data
        this.updateChartData(monthly_trend);
    }

    updateMetric(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            // Animate number counting
            this.animateValue(element, 0, value, 1000);
        }
    }

    animateValue(element, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            
            if (typeof end === 'string' && end.includes('₦')) {
                // Currency formatting
                const numericValue = parseInt(end.replace(/[₦,]/g, ''));
                const current = Math.floor(progress * numericValue);
                element.textContent = this.formatCurrency(current);
            } else if (typeof end === 'number') {
                // Regular number
                const current = Math.floor(progress * end);
                element.textContent = current.toLocaleString();
            } else {
                // String value
                element.textContent = end;
            }
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    formatCurrency(amount) {
        return `₦${parseInt(amount || 0).toLocaleString()}`;
    }

    updateRecentReferrals(referrals) {
        const container = document.getElementById('recentReferrals');
        if (!container) return;

        if (!referrals || referrals.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-3 opacity-50"></i>
                    <p>No referrals yet</p>
                    <a href="generate-referral.html" class="trust-badge inline-flex items-center px-4 py-2 text-white text-sm font-semibold rounded-lg mt-3">
                        <i class="fas fa-plus mr-2"></i>Create First Referral
                    </a>
                </div>
            `;
            return;
        }

        container.innerHTML = referrals.map(referral => `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div class="flex-1">
                    <div class="flex items-center space-x-3 mb-2">
                        <h4 class="font-semibold text-gray-900">${referral.prospect_company_name}</h4>
                        <span class="status-badge ${this.getStatusClass(referral.status)}">
                            ${this.getStatusText(referral.status)}
                        </span>
                    </div>
                    <div class="flex items-center space-x-4 text-sm text-gray-600">
                        <span class="flex items-center">
                            <i class="fas fa-hashtag mr-1"></i>
                            ${referral.referral_code}
                        </span>
                        <span class="flex items-center">
                            <i class="fas fa-money-bill-wave mr-1"></i>
                            ${this.formatCurrency(referral.total_commission_earned)}
                        </span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm text-gray-500">
                        ${new Date(referral.created_at).toLocaleDateString()}
                    </div>
                    <button onclick="partnerDashboard.viewReferral('${referral.id}')" 
                            class="text-blue-600 hover:text-blue-700 text-sm font-medium mt-1">
                        View Details
                    </button>
                </div>
            </div>
        `).join('');
    }

    getStatusClass(status) {
        const statusClasses = {
            'code_sent': 'status-pending',
            'contacted': 'status-active',
            'meeting_scheduled': 'status-active',
            'proposal_sent': 'status-active',
            'negotiation': 'status-active',
            'won': 'status-completed',
            'fully_paid': 'status-completed',
            'lost': 'status-lost'
        };
        return statusClasses[status] || 'status-pending';
    }

    getStatusText(status) {
        const statusTexts = {
            'code_sent': 'Code Sent',
            'contacted': 'Contacted',
            'meeting_scheduled': 'Meeting Scheduled',
            'proposal_sent': 'Proposal Sent',
            'negotiation': 'Negotiation',
            'won': 'Won',
            'fully_paid': 'Fully Paid',
            'lost': 'Lost'
        };
        return statusTexts[status] || status;
    }

    updatePayoutButton(canRequestPayout) {
        const payoutBtn = document.getElementById('payoutBtn');
        if (payoutBtn) {
            payoutBtn.disabled = !canRequestPayout;
            if (!canRequestPayout) {
                payoutBtn.title = 'No eligible commissions available for payout';
            }
        }
    }

    updatePerformanceTier(totalReferrals) {
        const tierEl = document.getElementById('performanceTier');
        const progressEl = document.getElementById('tierProgress');
        const progressTextEl = document.getElementById('tierProgressText');

        let tier = 'Bronze';
        let progress = 0;
        let nextTier = 'Silver';
        let referralsNeeded = 10;

        if (totalReferrals >= 50) {
            tier = 'Platinum';
            progress = 100;
            nextTier = 'Max Tier';
            referralsNeeded = 0;
        } else if (totalReferrals >= 25) {
            tier = 'Gold';
            progress = Math.min(100, ((totalReferrals - 25) / 25) * 100);
            nextTier = 'Platinum';
            referralsNeeded = 50 - totalReferrals;
        } else if (totalReferrals >= 10) {
            tier = 'Silver';
            progress = Math.min(100, ((totalReferrals - 10) / 15) * 100);
            nextTier = 'Gold';
            referralsNeeded = 25 - totalReferrals;
        } else {
            progress = (totalReferrals / 10) * 100;
            referralsNeeded = 10 - totalReferrals;
        }

        if (tierEl) tierEl.textContent = `${tier} Partner`;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (progressTextEl) {
            progressTextEl.textContent = referralsNeeded > 0 ? 
                `${totalReferrals}/10 to ${nextTier} Tier` : 
                'Maximum Tier Achieved!';
        }
    }

    initCharts() {
        const ctx = document.getElementById('commissionChart');
        if (!ctx) return;

        this.commissionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Commission Earnings',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '₦' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    updateChartData(monthlyTrend) {
        if (!this.commissionChart || !monthlyTrend) return;

        const labels = monthlyTrend.map(item => {
            const [year, month] = item.month.split('-');
            return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        });

        const data = monthlyTrend.map(item => item.amount);

        this.commissionChart.data.labels = labels;
        this.commissionChart.data.datasets[0].data = data;
        this.commissionChart.update();
    }

    setupAutoRefresh() {
        // Refresh data every 2 minutes
        setInterval(() => {
            this.loadDashboardData();
        }, 120000);

        // Also refresh when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.loadDashboardData();
            }
        });
    }

    async requestPayout() {
        try {
            if (!this.dashboardData.overview.available_for_payout || 
                this.dashboardData.overview.available_for_payout <= 0) {
                Toast.error('No eligible commissions available for payout');
                return;
            }

            const response = await apiClient.post(CONFIG.API.ENDPOINTS.PARTNER.PAYOUTS, {
                amount: this.dashboardData.overview.available_for_payout
            });

            if (response.data.success) {
                Toast.success('Payout request submitted successfully!');
                // Refresh dashboard data
                await this.loadDashboardData();
            } else {
                throw new Error(response.data.message);
            }
        } catch (error) {
            console.error('Payout request error:', error);
            Toast.error(error.response?.data?.message || 'Failed to submit payout request');
        }
    }

    viewReferral(referralId) {
        window.location.href = `referral-details.html?id=${referralId}`;
    }

    downloadCommissionCSV() {
        // Implement CSV export functionality
        Toast.info('Export feature coming soon!');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.partnerDashboard = new PartnerDashboard();
});

export default PartnerDashboard;