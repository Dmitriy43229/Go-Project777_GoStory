// update-checker.js
class UpdateChecker {
    constructor() {
        this.lastCheck = localStorage.getItem('last_update_check') || 0;
        this.checkInterval = 5 * 60 * 1000; // 5 минут
        this.version = '2.0.1';
    }
    
    async checkForUpdates() {
        const now = Date.now();
        
        // Проверяем не чаще чем раз в 5 минут
        if (now - this.lastCheck < this.checkInterval) {
            return;
        }
        
        try {
            // Проверяем версию на сервере
            const response = await fetch('/version.json?t=' + Date.now());
            if (response.ok) {
                const serverVersion = await response.json();
                
                if (serverVersion.version !== this.version) {
                    this.showUpdateNotification();
                }
            }
            
            localStorage.setItem('last_update_check', now.toString());
        } catch (error) {
            console.log('Update check failed:', error);
        }
    }
    
    showUpdateNotification() {
        // Показываем уведомление об обновлении
        const notification = document.createElement('div');
        notification.id = 'update-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #3b82f6, #1d4ed8);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 1rem;
            animation: slideIn 0.3s ease;
        `;
        
        notification.innerHTML = `
            <div>
                <strong>Доступно обновление!</strong>
                <div style="font-size: 0.9rem; opacity: 0.9;">
                    Перезагрузите страницу для применения изменений
                </div>
            </div>
            <button onclick="location.reload(true)" 
                    style="background: white; color: #3b82f6; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: bold;">
                Обновить
            </button>
            <button onclick="document.getElementById('update-notification').remove()" 
                    style="background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3); padding: 0.5rem; border-radius: 6px; cursor: pointer;">
                ✕
            </button>
        `;
        
        document.body.appendChild(notification);
        
        // Автоматически скрываем через 30 секунд
        setTimeout(() => {
            if (document.getElementById('update-notification')) {
                notification.remove();
            }
        }, 30000);
    }
    
    // Проверяем хэши файлов
    async checkFileIntegrity() {
        const files = [
            { url: '/script.js', hash: '' },
            { url: '/style.css', hash: '' },
            { url: '/index.html', hash: '' }
        ];
        
        for (const file of files) {
            try {
                const response = await fetch(file.url + '?integrity=' + Date.now());
                const text = await response.text();
                const hash = await this.calculateHash(text);
                
                const savedHash = localStorage.getItem('hash_' + file.url);
                if (savedHash && savedHash !== hash) {
                    console.log('File changed:', file.url);
                    return true;
                }
                
                localStorage.setItem('hash_' + file.url, hash);
            } catch (error) {
                console.log('Integrity check failed for:', file.url, error);
            }
        }
        
        return false;
    }
    
    async calculateHash(text) {
        // Простой хэш для проверки изменений
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
}

// Инициализация
const updateChecker = new UpdateChecker();

// Проверяем обновления при загрузке
document.addEventListener('DOMContentLoaded', () => {
    updateChecker.checkForUpdates();
    
    // Проверяем целостность файлов
    updateChecker.checkFileIntegrity().then(changed => {
        if (changed) {
            console.log('Файлы изменились, требуется обновление');
            if (confirm('Обнаружены изменения в файлах. Обновить страницу?')) {
                location.reload(true);
            }
        }
    });
    
    // Периодическая проверка
    setInterval(() => updateChecker.checkForUpdates(), updateChecker.checkInterval);
});