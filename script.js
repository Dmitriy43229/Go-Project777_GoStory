// ============================================
// UserManager Pro - Расширенная система
// ============================================

const CONFIG = {
    ADMIN_PASSWORD: 'admin123',
    STORAGE_KEY: 'usermanager_data',
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 минут
    CHART_AUTO_REFRESH: 30 * 1000, // 30 секунд
    MAINTENANCE_PAGE: 'maintenance.html'
};

// ================== СИСТЕМА ДОСТУПА ==================
let isAdmin = false;
let autoRefreshInterval = null;

// Инициализация системы доступа
function initAccessSystem() {
    console.log('=== ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ ДОСТУПА ===');
    
    // Проверяем GitHub Pages
    const isGitHubPages = window.location.hostname.includes('github.io');
    
    // Восстанавливаем состояние админа
    const adminData = localStorage.getItem('usermanager_admin_data');
    if (adminData) {
        const { logged, expiry } = JSON.parse(adminData);
        if (logged && Date.now() < expiry) {
            isAdmin = true;
            console.log('✅ Администратор: сессия восстановлена');
        } else {
            localStorage.removeItem('usermanager_admin_data');
        }
    }
    
    // Проверяем режим работы
    const useRealApi = localStorage.getItem('usermanager_use_real_api') !== 'false';
    CONFIG.USE_REAL_API = useRealApi;
    
    // Если не админ и локальный режим - перенаправляем
    if (!isAdmin && !CONFIG.USE_REAL_API) {
        console.log('⚠️ Неадмин в локальном режиме - перенаправление');
        window.location.href = CONFIG.MAINTENANCE_PAGE;
        return;
    }
    
    updateAccessUI();
    initUserTracking();
    
    if (isOnMainPage()) {
        initChartSystem();
    }
}

// Обновление UI системы доступа
function updateAccessUI() {
    // Кнопка входа
    const loginButtons = document.querySelectorAll('.login-btn');
    const apiModeButtons = document.querySelectorAll('.api-mode-btn');
    
    loginButtons.forEach(btn => {
        if (isAdmin) {
            btn.innerHTML = '<span>👑</span> <span>Админ</span>';
            btn.classList.add('admin');
            btn.title = 'Выйти из режима администратора';
            btn.onclick = logoutAdmin;
        } else {
            btn.innerHTML = '<span>🔐</span> <span>Войти</span>';
            btn.classList.remove('admin');
            btn.title = 'Войти как администратор';
            btn.onclick = showLoginModal;
        }
    });
    
    // Переключатель режимов (только для админа)
    apiModeButtons.forEach(btn => {
        if (isAdmin) {
            btn.style.display = 'flex';
            const isServer = CONFIG.USE_REAL_API;
            btn.innerHTML = isServer ? 
                '<span>🌐</span> <span>Серверный</span>' : 
                '<span>💾</span> <span>Локальный</span>';
            btn.title = `Переключить на ${isServer ? 'локальный' : 'серверный'} режим`;
            btn.onclick = toggleApiMode;
        } else {
            btn.style.display = 'none';
        }
    });
}

// Показать модальное окно входа
function showLoginModal() {
    if (document.getElementById('loginModal')) return;
    
    const modalHTML = `
        <div class="login-modal" id="loginModal">
            <div class="login-container">
                <div class="login-header">
                    <div class="login-icon">🔐</div>
                    <h2 class="login-title">Панель администратора</h2>
                    <p class="login-subtitle">Введите пароль для доступа</p>
                </div>
                
                <input type="password" 
                       id="adminPassword" 
                       class="password-input" 
                       placeholder="Введите пароль администратора">
                
                <p class="password-hint">Пароль знает только администратор системы</p>
                
                <div class="login-actions">
                    <button class="login-btn-secondary" onclick="closeLoginModal()">
                        <span>❌</span> Отмена
                    </button>
                    <button class="login-btn-primary" onclick="loginAdmin()">
                        <span>🔓</span> Войти
                    </button>
                </div>
                
                <div class="login-error" id="loginError">
                    ❌ Неверный пароль
                </div>
            </div>
        </div>
    `;
    
    const modal = document.createElement('div');
    modal.innerHTML = modalHTML;
    document.body.appendChild(modal);
    
    // Анимация появления
    setTimeout(() => {
        document.getElementById('loginModal').classList.add('active');
        document.getElementById('adminPassword').focus();
    }, 10);
    
    // Закрытие по Esc
    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            closeLoginModal();
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
    
    // Ввод по Enter
    document.getElementById('adminPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginAdmin();
    });
}

// Закрыть модальное окно
function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
}

// Вход администратора
function loginAdmin() {
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('loginError');
    
    if (password === CONFIG.ADMIN_PASSWORD) {
        isAdmin = true;
        
        // Сохраняем данные сессии
        const expiry = Date.now() + CONFIG.SESSION_TIMEOUT;
        localStorage.setItem('usermanager_admin_data', JSON.stringify({
            logged: true,
            expiry: expiry
        }));
        
        closeLoginModal();
        updateAccessUI();
        showNotification('✅ Вы вошли как администратор', 'success');
        
        // Если были на странице обслуживания - возвращаемся
        if (window.location.pathname.includes('maintenance.html')) {
            setTimeout(() => window.location.href = 'index.html', 1000);
        }
    } else {
        errorEl.style.display = 'block';
        const input = document.getElementById('adminPassword');
        input.style.animation = 'shake 0.5s';
        input.style.borderColor = '#f87171';
        input.value = '';
        setTimeout(() => input.style.animation = '', 500);
    }
}

// Выход администратора
function logoutAdmin() {
    if (confirm('Вы действительно хотите выйти из режима администратора?')) {
        isAdmin = false;
        localStorage.removeItem('usermanager_admin_data');
        updateAccessUI();
        showNotification('👋 Вы вышли из режима администратора', 'info');
    }
}

// Переключение режима
function toggleApiMode() {
    if (!isAdmin) {
        showNotification('🔒 Только администратор может переключать режимы', 'warning');
        return;
    }
    
    const newMode = !CONFIG.USE_REAL_API;
    CONFIG.USE_REAL_API = newMode;
    localStorage.setItem('usermanager_use_real_api', newMode.toString());
    
    showNotification(
        newMode ? 
        '🌐 Включен серверный режим' : 
        '💾 Включен локальный режим',
        newMode ? 'info' : 'warning'
    );
    
    updateAccessUI();
    
    // Перезагружаем данные если на главной
    if (isOnMainPage()) {
        loadUsers();
        updateChartData();
    }
}

// ================== СИСТЕМА УЧЕТА ПОЛЬЗОВАТЕЛЕЙ ==================
let userStats = {
    totalVisitors: 0,
    activeUsers: 0,
    totalVisits: 0,
    visitorHistory: [],
    userSessions: {}
};

// Инициализация отслеживания пользователей
function initUserTracking() {
    // Загружаем статистику
    const savedStats = localStorage.getItem('usermanager_user_stats');
    if (savedStats) {
        userStats = JSON.parse(savedStats);
    }
    
    // Создаем уникальный ID для этого посетителя
    let visitorId = localStorage.getItem('usermanager_visitor_id');
    if (!visitorId) {
        visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('usermanager_visitor_id', visitorId);
        userStats.totalVisitors++;
    }
    
    // Регистрируем сессию
    const sessionId = 'session_' + Date.now();
    userStats.userSessions[sessionId] = {
        visitorId: visitorId,
        startTime: Date.now(),
        lastActivity: Date.now(),
        active: true
    };
    
    userStats.totalVisits++;
    userStats.activeUsers = Object.keys(userStats.userSessions).length;
    
    // Сохраняем обновленную статистику
    saveUserStats();
    
    // Обновляем отображение
    updateUserStatsDisplay();
    
    // Запускаем очистку неактивных сессий
    setInterval(cleanupInactiveSessions, 60000); // Каждую минуту
    
    // Обновляем активность пользователя
    document.addEventListener('mousemove', updateUserActivity);
    document.addEventListener('keydown', updateUserActivity);
    
    // Синхронизация между вкладками
    window.addEventListener('storage', (e) => {
        if (e.key === 'usermanager_user_stats') {
            userStats = JSON.parse(e.newValue);
            updateUserStatsDisplay();
        }
    });
}

// Обновление активности пользователя
function updateUserActivity() {
    const sessionId = Object.keys(userStats.userSessions)[0];
    if (sessionId && userStats.userSessions[sessionId]) {
        userStats.userSessions[sessionId].lastActivity = Date.now();
        saveUserStats();
    }
}

// Очистка неактивных сессий (более 5 минут без активности)
function cleanupInactiveSessions() {
    const now = Date.now();
    const inactiveTime = 5 * 60 * 1000; // 5 минут
    
    for (const sessionId in userStats.userSessions) {
        if (now - userStats.userSessions[sessionId].lastActivity > inactiveTime) {
            delete userStats.userSessions[sessionId];
        }
    }
    
    userStats.activeUsers = Object.keys(userStats.userSessions).length;
    saveUserStats();
    updateUserStatsDisplay();
}

// Сохранение статистики
function saveUserStats() {
    localStorage.setItem('usermanager_user_stats', JSON.stringify(userStats));
}

// Обновление отображения статистики
function updateUserStatsDisplay() {
    if (!isOnMainPage()) return;
    
    const elements = {
        totalVisitors: document.getElementById('totalVisitors'),
        activeUsers: document.getElementById('activeUsers'),
        totalVisits: document.getElementById('totalVisits')
    };
    
    if (elements.totalVisitors) elements.totalVisitors.textContent = userStats.totalVisitors;
    if (elements.activeUsers) elements.activeUsers.textContent = userStats.activeUsers;
    if (elements.totalVisits) elements.totalVisits.textContent = userStats.totalVisits;
}

// ================== СИСТЕМА ГРАФИКОВ ==================
function initChartSystem() {
    // Загружаем данные для графика
    loadChartData();
    
    // Запускаем автообновление если включено
    const autoRefreshEnabled = localStorage.getItem('usermanager_auto_refresh') !== 'false';
    if (autoRefreshEnabled) {
        startAutoRefresh();
    }
    
    // Настройка кнопок
    const refreshBtn = document.getElementById('refreshChartBtn');
    const autoRefreshBtn = document.getElementById('autoRefreshBtn');
    
    if (refreshBtn) {
        refreshBtn.onclick = updateChartData;
    }
    
    if (autoRefreshBtn) {
        autoRefreshBtn.onclick = toggleAutoRefresh;
        updateAutoRefreshButton(autoRefreshEnabled);
    }
}

// Загрузка данных для графика
function loadChartData() {
    // Загружаем историю из localStorage
    const history = JSON.parse(localStorage.getItem('usermanager_chart_history') || '[]');
    
    // Если истории нет, создаем начальные данные
    if (history.length === 0) {
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            history.push({
                date: date.toLocaleDateString('ru-RU'),
                day: days[date.getDay()],
                visits: Math.floor(Math.random() * 30) + 20,
                activeUsers: Math.floor(Math.random() * 15) + 5
            });
        }
        localStorage.setItem('usermanager_chart_history', JSON.stringify(history));
    }
    
    return history;
}

// Обновление данных графика
function updateChartData() {
    console.log('🔄 Обновление данных графика...');
    
    // Показать состояние загрузки
    const refreshBtn = document.getElementById('refreshChartBtn');
    const originalHTML = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<span class="spinner"></span> Обновление...';
    refreshBtn.disabled = true;
    
    // Обновляем статистику пользователей
    cleanupInactiveSessions();
    
    // Загружаем историю
    const history = loadChartData();
    
    // Обновляем текущий день
    const today = new Date().toLocaleDateString('ru-RU');
    const todayData = history.find(h => h.date === today);
    
    if (todayData) {
        todayData.visits += Math.floor(Math.random() * 5) + 1;
        todayData.activeUsers = userStats.activeUsers;
    } else {
        // Добавляем новый день
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        history.push({
            date: today,
            day: days[new Date().getDay()],
            visits: userStats.totalVisits,
            activeUsers: userStats.activeUsers
        });
        
        // Ограничиваем историю 7 днями
        if (history.length > 7) {
            history.shift();
        }
    }
    
    // Сохраняем обновленную историю
    localStorage.setItem('usermanager_chart_history', JSON.stringify(history));
    
    // Обновляем существующий график Chart.js
    if (window.charts && window.charts.activity) {
        const chart = window.charts.activity;
        
        // Обновляем данные
        chart.data.datasets[0].data = history.map(h => h.visits);
        chart.data.datasets[1] = chart.data.datasets[1] || {
            label: 'Активные пользователи',
            data: history.map(h => h.activeUsers),
            borderColor: '#34d399',
            backgroundColor: 'rgba(52, 211, 153, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#34d399'
        };
        chart.data.datasets[1].data = history.map(h => h.activeUsers);
        
        // Обновляем подписи
        chart.data.labels = history.map(h => `${h.day} (${h.date})`);
        
        chart.update('none');
    }
    
    // Обновляем время последнего обновления
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const updateElement = document.getElementById('lastChartUpdate');
    if (updateElement) {
        updateElement.textContent = timeStr;
        updateElement.style.color = '#34d399';
        updateElement.style.fontWeight = '600';
        
        // Возвращаем обычный цвет через 2 секунды
        setTimeout(() => {
            updateElement.style.color = '';
            updateElement.style.fontWeight = '';
        }, 2000);
    }
    
    // Обновляем статистику пользователей
    updateUserStatsDisplay();
    
    // Возвращаем кнопку в исходное состояние
    setTimeout(() => {
        refreshBtn.innerHTML = originalHTML;
        refreshBtn.disabled = false;
        showNotification('✅ Данные графика обновлены', 'success');
    }, 500);
}

// Автоматическое обновление графика
function toggleAutoRefresh() {
    const isEnabled = localStorage.getItem('usermanager_auto_refresh') !== 'false';
    const newState = !isEnabled;
    
    localStorage.setItem('usermanager_auto_refresh', newState.toString());
    
    if (newState) {
        startAutoRefresh();
        showNotification('⏱️ Автообновление включено (каждые 30 сек)', 'info');
    } else {
        stopAutoRefresh();
        showNotification('⏱️ Автообновление отключено', 'warning');
    }
    
    updateAutoRefreshButton(newState);
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    
    autoRefreshInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            updateChartData();
        }
    }, CONFIG.CHART_AUTO_REFRESH);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function updateAutoRefreshButton(isEnabled) {
    const btn = document.getElementById('autoRefreshBtn');
    const status = document.getElementById('autoRefreshStatus');
    
    if (btn && status) {
        btn.innerHTML = isEnabled ? 
            '<span>⏱️</span> Авто: <span id="autoRefreshStatus">Вкл</span>' :
            '<span>⏱️</span> Авто: <span id="autoRefreshStatus">Выкл</span>';
        btn.style.background = isEnabled ? 
            'rgba(34, 197, 94, 0.2)' : 
            'rgba(239, 68, 68, 0.2)';
        btn.style.borderColor = isEnabled ? 
            'rgba(34, 197, 94, 0.4)' : 
            'rgba(239, 68, 68, 0.4)';
    }
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================
function isOnMainPage() {
    const path = window.location.pathname;
    return path.includes('index.html') || path === '/' || path.endsWith('/');
}

function showNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification show ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.2rem;">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>${message}</span>
        </div>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
        color: white;
        padding: 0.75rem 1.25rem;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        z-index: 10001;
        animation: slideIn 0.3s ease;
        max-width: 300px;
        word-break: break-word;
    `;
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ================== ИНИЦИАЛИЗАЦИЯ ==================
document.addEventListener('DOMContentLoaded', () => {
    // Инициализируем систему доступа
    initAccessSystem();
    
    // Добавляем стили для анимаций
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    // Очищаем сессию при закрытии вкладки (только если не админ)
    window.addEventListener('beforeunload', () => {
        if (!isAdmin) {
            cleanupInactiveSessions();
        }
    });
});