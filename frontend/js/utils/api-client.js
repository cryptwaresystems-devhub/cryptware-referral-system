// js/utils/api-client.js
import { buildApiUrl } from '../config.js';
import Toast from './toast.js';

class ApiClient {
    constructor() {
        this.baseUrl = buildApiUrl('');
    }

    async request(endpoint, options = {}) {
        const url = buildApiUrl(endpoint);
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    async get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    async post(endpoint, data = {}, options = {}) {
        return this.request(endpoint, { ...options, method: 'POST', body: data });
    }

    async put(endpoint, data = {}, options = {}) {
        return this.request(endpoint, { ...options, method: 'PUT', body: data });
    }

    async delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }
}

export const apiClient = new ApiClient();