import { apiClient, CONFIG } from './config.js';
import Toast from './utils/toast.js';

class PartnerDashboard {
    constructor() {
        this.currentPartner = null;
        this.dashboardData = null;
        this.commissionChart = null;
        this.payoutRequests = new Set(); // Track which referrals have pending payouts
        this.init();
    }

    async init() {
        try {
            // Check authentication
            const isAuthenticated = await AuthManager.requireAuth('partner');
            if (!isAuthenticated) return;

            // Load header
            await this.loadHeader();
            
            // Load partner data
            await this.loadPartnerData();
            
            // Load dashboard data
            await this.loadDashboardData();
            
            // Load payout requests to track which referrals have pending payouts
            await this.loadPayoutRequests();
            
            // Initialize charts
            this.initCharts();
            
            // Set up auto-refresh
            this.setupAutoRefresh();
            
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            Toast.error('Failed to initialize dashboard');
        }
    }

    async loadHeader() {
        try {
            const response = await fetch('partner-header.html');
            const headerHTML = await response.text();
            document.getElementById('header-container').innerHTML = headerHTML;
        } catch (error) {
            console.error('Error loading header:', error);
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

    async loadPayoutRequests() {
        try {
            const response = await apiClient.get('/payouts/partner?limit=100');
            if (response.data.success) {
                // Track referrals with pending payouts
                response.data.data.payouts
                    .filter(payout => payout.status === 'pending')
                    .forEach(payout => {
                        if (payout.referral_id) {
                            this.payoutRequests.add(payout.referral_id);
                        }
                    });
            }
        } catch (error) {
            console.error('Error loading payout requests:', error);
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

        const { overview, referrals_breakdown, recent_referrals, monthly_trend, quick_actions, payout_eligibility } = this.dashboardData;

        // Update key metrics
        this.updateMetric('totalReferrals', overview.total_referrals);
        this.updateMetric('activeReferrals', overview.active_referrals);
        this.updateMetric('totalCommission', this.formatCurrency(overview.total_commission_earned));
        this.updateMetric('availablePayout', this.formatCurrency(overview.available_for_payout));

        // Update payout card specifically
        this.updateMetric('dashboardAvailablePayout', this.formatCurrency(overview.available_for_payout));
        this.updateMetric('dashboardEligibleCount', payout_eligibility?.eligible_count || 0);

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
            if (typeof value === 'number') {
                this.animateValue(element, 0, value, 1000);
            } else {
                element.textContent = value;
            }
        }
    }

    animateValue(element, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            
            if (typeof end === 'number') {
                const current = Math.floor(progress * end);
                element.textContent = current.toLocaleString();
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

        container.innerHTML = referrals.map(referral => {
            const hasPendingPayout = this.payoutRequests.has(referral.id);
            const canRequestPayout = referral.status === 'fully_paid' && 
                                   referral.commission_eligible && 
                                   !hasPendingPayout &&
                                   (referral.total_commission_earned || 0) > 0;

            return `
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div class="flex-1">
                        <div class="flex items-center space-x-3 mb-2">
                            <h4 class="font-semibold text-gray-900">${referral.prospect_company_name}</h4>
                            <span class="status-badge ${this.getStatusClass(referral.status)}">
                                ${this.getStatusText(referral.status)}
                            </span>
                            ${hasPendingPayout ? `
                                <span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                                    Payout Pending
                                </span>
                            ` : ''}
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
                    <div class="text-right space-y-2">
                        <div class="text-sm text-gray-500">
                            ${new Date(referral.created_at).toLocaleDateString()}
                        </div>
                        <div class="space-x-2">
                            <button onclick="partnerDashboard.viewReferral('${referral.id}')" 
                                    class="text-blue-600 hover:text-blue-700 text-sm font-medium">
                                View Details
                            </button>
                            ${canRequestPayout ? `
                                <button onclick="partnerDashboard.requestPayoutForReferral('${referral.id}', ${referral.total_commission_earned})" 
                                        class="text-green-600 hover:text-green-700 text-sm font-medium">
                                    Request Payout
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
                payoutBtn.innerHTML = '<i class="fas fa-money-bill-wave mr-2"></i>No Payout Available';
            } else {
                payoutBtn.innerHTML = '<i class="fas fa-money-bill-wave mr-2"></i>Request Payout';
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
            progress = Math.min(100, (totalReferrals / 10) * 100);
            referralsNeeded = 10 - totalReferrals;
        }

        if (tierEl) tierEl.textContent = tier;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (progressTextEl) {
            if (referralsNeeded > 0) {
                progressTextEl.textContent = `${referralsNeeded} more referrals to ${nextTier}`;
            } else {
                progressTextEl.textContent = 'Maximum tier achieved!';
            }
        }
    }

    initCharts() {
        // Commission trend chart
        const ctx = document.getElementById('commissionChart');
        if (ctx) {
            this.commissionChart = new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Monthly Commission',
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
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    return `₦${parseInt(context.raw).toLocaleString()}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '₦' + parseInt(value).toLocaleString();
                                }
                            }
                        }
                    }
                }
            });
        }

        // Referral status chart
        const statusCtx = document.getElementById('referralStatusChart');
        if (statusCtx) {
            this.statusChart = new Chart(statusCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Code Sent', 'Contacted', 'In Progress', 'Converted'],
                    datasets: [{
                        data: [0, 0, 0, 0],
                        backgroundColor: [
                            '#f59e0b', // amber-500
                            '#3b82f6', // blue-500
                            '#8b5cf6', // violet-500
                            '#10b981'  // emerald-500
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }
    }

    updateChartData(monthlyTrend) {
        if (!monthlyTrend || !this.commissionChart) return;

        const labels = monthlyTrend.map(item => {
            const date = new Date(item.year, item.month - 1);
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        });

        const data = monthlyTrend.map(item => item.total_commission);

        this.commissionChart.data.labels = labels;
        this.commissionChart.data.datasets[0].data = data;
        this.commissionChart.update();

        // Update status chart if available
        if (this.statusChart && this.dashboardData) {
            const breakdown = this.dashboardData.referrals_breakdown;
            this.statusChart.data.datasets[0].data = [
                breakdown.code_sent,
                breakdown.contacted,
                breakdown.meeting_scheduled + breakdown.proposal_sent + breakdown.negotiation,
                breakdown.fully_paid
            ];
            this.statusChart.update();
        }
    }

    setupAutoRefresh() {
        // Refresh dashboard data every 2 minutes
        setInterval(() => {
            this.loadDashboardData();
        }, 120000);

        // Listen for real-time updates if available
        if (typeof supabase !== 'undefined') {
            this.setupRealtimeUpdates();
        }
    }

    setupRealtimeUpdates() {
        // Set up real-time subscription for referral status updates
        const subscription = supabase
            .channel('referral-updates')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'referrals',
                    filter: `partner_id=eq.${this.currentPartner.id}`
                }, 
                (payload) => {
                    console.log('Real-time update received:', payload);
                    this.loadDashboardData(); // Refresh data
                    Toast.info('Referral status updated');
                }
            )
            .subscribe();
    }

    async requestPayoutForReferral(referralId, amount) {
        try {
            // Disable the button immediately
            const buttons = document.querySelectorAll(`[onclick*="${referralId}"]`);
            buttons.forEach(btn => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
            });

            const response = await apiClient.post('/payouts/request', {
                referral_id: referralId,
                amount: amount
            });

            if (response.data.success) {
                // Add to pending payouts
                this.payoutRequests.add(referralId);
                
                // Show success message
                Toast.success('Payout request sent to Cryptware team. Payment will be processed within 24-48 hours.');
                
                // Reload dashboard to reflect changes
                setTimeout(() => {
                    this.loadDashboardData();
                }, 2000);
            } else {
                throw new Error(response.data.message);
            }
        } catch (error) {
            console.error('Error requesting payout:', error);
            Toast.error(error.response?.data?.message || 'Failed to request payout');
            
            // Re-enable buttons
            const buttons = document.querySelectorAll(`[onclick*="${referralId}"]`);
            buttons.forEach(btn => {
                btn.disabled = false;
                btn.innerHTML = 'Request Payout';
            });
        }
    }

    viewReferral(referralId) {
        window.location.href = `referral-details.html?id=${referralId}`;
    }

    async exportCommissionReport() {
        try {
            const startDate = document.getElementById('exportStartDate')?.value;
            const endDate = document.getElementById('exportEndDate')?.value;

            const response = await apiClient.get('/commissions/export', {
                params: { start_date: startDate, end_date: endDate },
                responseType: 'blob'
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `commission-report-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            Toast.success('Commission report exported successfully');
        } catch (error) {
            console.error('Error exporting commission report:', error);
            Toast.error('Failed to export commission report');
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.partnerDashboard = new PartnerDashboard();
});