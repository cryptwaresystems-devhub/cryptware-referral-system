
// Internal Dashboard JavaScript - Complete with backend integration
class InternalDashboard {
    constructor() {
        this.currentUser = null;
        this.leads = [];
        this.stats = {};
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Internal Dashboard...');
        await this.checkAuth();
        await this.loadDashboardData();
        this.setupEventListeners();
        this.loadLeadsForSelect();
    }

    async checkAuth() {
        try {
            const authResult = await AuthManager.requireAuth('internal');
            if (!authResult) {
                console.error('❌ Authentication failed');
                return;
            }

            this.currentUser = AuthManager.getCurrentUser();
            if (this.currentUser && this.currentUser.data) {
                document.getElementById('userName').textContent = this.currentUser.data.name || this.currentUser.data.email;
                console.log('✅ User authenticated:', this.currentUser.data.name);
            }
        } catch (error) {
            console.error('Auth check error:', error);
            Toast.error('Authentication failed');
        }
    }

    async loadDashboardData() {
        try {
            console.log('📊 Loading dashboard data...');
            this.showLoadingState();

            // Load data in parallel
            const [dashboardResponse, leadsResponse] = await Promise.all([
                this.apiCall('GET', '/internal/dashboard'),
                this.apiCall('GET', '/leads?limit=10&page=1')
            ]);

            if (dashboardResponse && dashboardResponse.success) {
                console.log('✅ Dashboard data loaded:', dashboardResponse.data);
                this.updateStats(dashboardResponse.data.metrics);
            } else {
                console.error('❌ Dashboard API failed:', dashboardResponse);
                Toast.error('Failed to load dashboard statistics');
            }

            if (leadsResponse && leadsResponse.success) {
                console.log('✅ Leads data loaded:', leadsResponse.data.leads?.length || 0, 'leads');
                this.leads = leadsResponse.data.leads || [];
                this.renderLeadsTable();
            } else {
                console.error('❌ Leads API failed:', leadsResponse);
                Toast.error('Failed to load leads data');
            }

            this.hideLoadingState();

        } catch (error) {
            console.error('💥 Dashboard load error:', error);
            this.hideLoadingState();
            Toast.error('Failed to load dashboard data');
        }
    }

    async apiCall(method, endpoint, data = null) {
        try {
            // Get the base URL from config or use default
            const baseURL = window.CONFIG?.API?.BASE_URL || 'http://localhost:8000/api';
            const token = localStorage.getItem('authToken');
            
            console.log(`🌐 API Call: ${method} ${baseURL}${endpoint}`);

            const response = await fetch(`${baseURL}${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: data ? JSON.stringify(data) : null
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log(`✅ API Response: ${endpoint}`, result);
            return result;

        } catch (error) {
            console.error(`❌ API call failed for ${endpoint}:`, error);
            throw error;
        }
    }

    updateStats(metrics) {
        if (!metrics) {
            console.warn('No metrics data received');
            return;
        }

        try {
            // Update main stats cards
            this.updateElement('totalLeads', metrics.performance?.total_leads || 0);
            this.updateElement('pendingLeads', metrics.performance?.active_referrals || 0);
            this.updateElement('convertedLeads', metrics.performance?.converted_leads || 0);
            
            const totalCommission = metrics.financial?.total_commission || 0;
            this.updateElement('partnerPayouts', `₦${totalCommission.toLocaleString()}`);

            // Update live overview
            this.updateElement('liveTotalLeads', metrics.performance?.total_leads || 0);
            this.updateElement('liveActiveLeads', metrics.performance?.active_referrals || 0);
            this.updateElement('livePartnerRefs', metrics.partners?.active_partners || 0);
            
            const conversionRate = Math.round(metrics.performance?.conversion_rate || 0);
            this.updateElement('liveConversionRate', `${conversionRate}%`);

        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    updateElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    renderLeadsTable() {
        const tbody = document.getElementById('leadsTableBody');
        const emptyState = document.getElementById('emptyState');

        if (!tbody) {
            console.error('Leads table body not found');
            return;
        }

        if (this.leads.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        
        tbody.innerHTML = this.leads.map(lead => `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-3 py-3">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <i class="fas fa-building text-blue-600 text-sm"></i>
                        </div>
                        <div class="ml-3">
                            <div class="text-sm font-medium text-gray-900">${this.escapeHtml(lead.company_name)}</div>
                            <div class="text-xs text-gray-500">${this.escapeHtml(lead.contact_name)}</div>
                        </div>
                    </div>
                </td>
                <td class="px-3 py-3 hidden sm:table-cell">
                    <span class="type-badge ${lead.source === 'partner' ? 'type-partner' : 'type-internal'}">
                        <i class="fas ${lead.source === 'partner' ? 'fa-handshake' : 'fa-building'} mr-1"></i>
                        ${lead.source === 'partner' ? 'Partner' : 'Internal'}
                    </span>
                </td>
                <td class="px-3 py-3 hidden md:table-cell">
                    <span class="text-xs font-mono text-gray-600">${lead.referral_code || '—'}</span>
                </td>
                <td class="px-3 py-3">
                    <span class="status-badge status-${lead.status}">
                        ${this.getStatusText(lead.status)}
                    </span>
                </td>
                <td class="px-3 py-3 hidden lg:table-cell">
                    <span class="text-sm text-gray-900">${lead.estimated_value ? `₦${lead.estimated_value.toLocaleString()}` : '—'}</span>
                </td>
                <td class="px-3 py-3">
                    <div class="flex space-x-1 action-buttons">
                        <a href="internal-lead-details.html?id=${lead.id}" 
                           class="view-btn action-btn flex items-center text-xs">
                            <i class="fas fa-eye mr-1"></i> View
                        </a>
                        ${lead.status !== 'converted' && lead.status !== 'lost' ? `
                        <button onclick="internalDashboard.showConvertModal('${lead.id}')" 
                                class="convert-btn action-btn flex items-center text-xs">
                            <i class="fas fa-check mr-1"></i> Convert
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        console.log(`✅ Rendered ${this.leads.length} leads in table`);
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    getStatusText(status) {
        const statusMap = {
            'new': 'New',
            'contacted': 'Contacted', 
            'qualified': 'Qualified',
            'proposal': 'Proposal',
            'negotiation': 'Negotiation',
            'converted': 'Converted',
            'lost': 'Lost'
        };
        return statusMap[status] || status;
    }

    showLoadingState() {
        const loadingState = document.getElementById('loadingState');
        const emptyState = document.getElementById('emptyState');
        
        if (loadingState) loadingState.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');
    }

    hideLoadingState() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) loadingState.classList.add('hidden');
    }

    async loadLeadsForSelect() {
        try {
            const response = await this.apiCall('GET', '/leads?limit=100');
            if (response && response.success) {
                const leads = response.data.leads || [];
                this.populateLeadSelect(leads);
            }
        } catch (error) {
            console.error('Failed to load leads for select:', error);
        }
    }

    populateLeadSelect(leads) {
        const leadSelect = document.getElementById('paymentLeadSelect');
        const modalLeadSelect = document.getElementById('leadSelect');
        
        if (!leadSelect && !modalLeadSelect) return;

        const options = leads.map(lead => 
            `<option value="${lead.id}">${this.escapeHtml(lead.company_name)} - ${this.escapeHtml(lead.contact_name)}</option>`
        ).join('');

        const defaultOption = '<option value="">Choose lead...</option>';
        
        if (leadSelect) leadSelect.innerHTML = defaultOption + options;
        if (modalLeadSelect) modalLeadSelect.innerHTML = defaultOption + options;
    }

    // Modal Methods
    showRecordCodeModal() {
        const modal = document.getElementById('recordCodeModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.loadLeadsForSelect();
        }
    }

    hideRecordCodeModal() {
        const modal = document.getElementById('recordCodeModal');
        if (modal) modal.classList.add('hidden');
    }

    showPaymentModal() {
        const leadSelect = document.getElementById('paymentLeadSelect');
        const amountInput = document.getElementById('paymentAmount');
        
        if (!leadSelect || !amountInput) return;

        const selectedOption = leadSelect.options[leadSelect.selectedIndex];
        const amount = parseFloat(amountInput.value) || 0;
        
        if (!leadSelect.value) {
            Toast.error('Please select a lead first');
            return;
        }

        if (amount <= 0) {
            Toast.error('Please enter a valid amount');
            return;
        }

        const modal = document.getElementById('paymentModal');
        if (modal) {
            document.getElementById('paymentLeadName').textContent = selectedOption.text;
            document.getElementById('paymentAmountDisplay').textContent = `₦${amount.toLocaleString()}`;
            document.getElementById('paymentCommissionDisplay').textContent = `₦${(amount * 0.05).toLocaleString()}`;
            modal.classList.remove('hidden');
        }
    }

    hidePaymentModal() {
        const modal = document.getElementById('paymentModal');
        if (modal) modal.classList.add('hidden');
    }

    calculateCommission() {
        const amountInput = document.getElementById('paymentAmount');
        const preview = document.getElementById('commissionPreview');
        
        if (!amountInput || !preview) return;

        const amount = parseFloat(amountInput.value) || 0;
        const commission = amount * 0.05;
        
        const commissionElement = document.getElementById('commissionAmountPreview');
        if (commissionElement) {
            commissionElement.textContent = `₦${commission.toLocaleString()}`;
        }
        
        if (amount > 0) {
            preview.classList.remove('hidden');
        } else {
            preview.classList.add('hidden');
        }
    }

    async confirmPayment() {
        try {
            const leadSelect = document.getElementById('paymentLeadSelect');
            const amountInput = document.getElementById('paymentAmount');
            
            if (!leadSelect.value) {
                Toast.error('Please select a lead');
                return;
            }

            const amount = parseFloat(amountInput.value) || 0;
            if (amount <= 0) {
                Toast.error('Please enter a valid amount');
                return;
            }

            // Call payments API
            const response = await this.apiCall('POST', '/payments', {
                lead_id: leadSelect.value,
                amount: amount,
                payment_method: 'bank-transfer',
                payment_date: new Date().toISOString().split('T')[0]
            });

            if (response && response.success) {
                Toast.success('Payment recorded successfully!');
                this.hidePaymentModal();
                
                // Reset form
                leadSelect.value = '';
                amountInput.value = '';
                document.getElementById('commissionPreview').classList.add('hidden');
                
                // Reload data
                await this.loadDashboardData();
            } else {
                Toast.error(response?.message || 'Failed to record payment');
            }

        } catch (error) {
            console.error('Payment confirmation error:', error);
            Toast.error('Failed to record payment');
        }
    }

    async recordReferralCode() {
        try {
            const codeInput = document.getElementById('referralCodeInput');
            const leadSelect = document.getElementById('leadSelect');
            
            if (!codeInput.value || !leadSelect.value) {
                Toast.error('Please fill in all fields');
                return;
            }

            // Update lead with referral code
            const response = await this.apiCall('PUT', `/leads/${leadSelect.value}`, {
                referral_code: codeInput.value.toUpperCase()
            });

            if (response && response.success) {
                Toast.success('Referral code recorded successfully!');
                this.hideRecordCodeModal();
                
                // Reset form
                codeInput.value = '';
                leadSelect.value = '';
                
                // Reload data
                await this.loadDashboardData();
            } else {
                Toast.error(response?.message || 'Failed to record referral code');
            }

        } catch (error) {
            console.error('Referral code recording error:', error);
            Toast.error('Failed to record referral code');
        }
    }

    setupEventListeners() {
        // Refresh table
        const refreshBtn = document.getElementById('refreshTable');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadDashboardData();
                Toast.info('Refreshing data...');
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                AuthManager.logout();
            });
        }

        // Close modals on outside click
        this.setupModalCloseListeners();

        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.loadDashboardData();
        }, 30000);

        console.log('✅ Event listeners setup complete');
    }

    setupModalCloseListeners() {
        const modals = ['recordCodeModal', 'paymentModal'];
        
        modals.forEach(modalId => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideRecordCodeModal();
                        this.hidePaymentModal();
                    }
                });
            }
        });
    }

    showConvertModal(leadId) {
        // Implementation for convert modal
        console.log('Convert lead:', leadId);
        Toast.info('Convert feature coming soon...');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Starting Internal Dashboard...');
    window.internalDashboard = new InternalDashboard();
});