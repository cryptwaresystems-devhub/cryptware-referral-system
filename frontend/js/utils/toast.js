class Toast {
    static show(message, type = 'info', duration = 4000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'fixed top-4 right-4 z-50 space-y-3';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const toastId = 'toast-' + Date.now();
        toast.id = toastId;
        
        const styles = {
            success: {
                bg: 'bg-green-500',
                border: 'border-green-400',
                icon: '✅'
            },
            error: {
                bg: 'bg-red-500',
                border: 'border-red-400',
                icon: '❌'
            },
            warning: {
                bg: 'bg-yellow-500',
                border: 'border-yellow-400',
                icon: '⚠️'
            },
            info: {
                bg: 'bg-blue-500',
                border: 'border-blue-400',
                icon: '💡'
            }
        };

        const style = styles[type] || styles.info;

        toast.className = `transform transition-all duration-300 ease-in-out ${style.bg} text-white px-6 py-4 rounded-xl shadow-xl border ${style.border} max-w-sm opacity-0 translate-x-20`;
        toast.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <span class="text-lg mr-3">${style.icon}</span>
                    <span class="font-medium">${message}</span>
                </div>
                <button onclick="Toast.dismiss('${toastId}')" class="ml-4 text-white hover:text-gray-200 transition">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('opacity-0', 'translate-x-20');
            toast.classList.add('opacity-100', 'translate-x-0');
        });

        if (duration > 0) {
            setTimeout(() => this.dismiss(toastId), duration);
        }

        return toastId;
    }

    static dismiss(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.classList.remove('opacity-100', 'translate-x-0');
            toast.classList.add('opacity-0', 'translate-x-20');
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                
                const container = document.getElementById('toast-container');
                if (container && container.children.length === 0) {
                    container.parentNode.removeChild(container);
                }
            }, 300);
        }
    }

    static success(message, duration) {
        return this.show(message, 'success', duration);
    }

    static error(message, duration) {
        return this.show(message, 'error', duration);
    }

    static warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    static info(message, duration) {
        return this.show(message, 'info', duration);
    }
}

// Make Toast available globally
window.Toast = Toast;
export default Toast;