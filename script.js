// ============================================
// UserManager Pro - Адаптивный клиент
// Работает с Go API или локально
// ============================================

// Принудительное обновление кеша при загрузке
(function() {
    // Проверяем версию в localStorage
    const CURRENT_VERSION = '2.1.0'; // Новая версия
    const savedVersion = localStorage.getItem('usermanager_version');
    
    if (savedVersion !== CURRENT_VERSION) {
        console.log('🔄 Обновление версии с', savedVersion, 'на', CURRENT_VERSION);
        
        // Очищаем все данные при обновлении
        localStorage.clear();
        
        // Сохраняем новую версию
        localStorage.setItem('usermanager_version', CURRENT_VERSION);
        
        // Принудительно перезагружаем страницу
        if (!sessionStorage.getItem('already_reloaded')) {
            sessionStorage.setItem('already_reloaded', 'true');
            console.log('🔄 Принудительная перезагрузка для обновления');
            setTimeout(() => {
                window.location.reload(true);
            }, 100);
        }
    }
    
    // Добавляем параметр для игнорирования кеша при загрузке API
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        // Добавляем timestamp для GET запросов к API
        if (url && typeof url === 'string' && url.includes('/api/')) {
            const separator = url.includes('?') ? '&' : '?';
            url = url + separator + '_=' + Date.now();
        }
        return originalFetch.call(this, url, options);
    };
})();

const CONFIG = {
    USE_REAL_API: true, // По умолчанию серверный режим
    API_URL: 'http://localhost:8068/api',
    STORAGE_KEY: 'usermanager_local_data',
    VERSION: '2.1.0'
};

// ================== СИСТЕМА АДМИНИСТРАТОРА ==================
const ADMIN_PASSWORD = "admin123";
let isAdmin = false;
let adminSessionId = null;
let currentServerMode = "server";

// Проверка и инициализация режима при загрузке
async function initializeSystem() {
    console.log('🔄 Инициализация системы...');
    
    // 1. Проверяем активность админской сессии
    const savedAdmin = localStorage.getItem('usermanager_admin_session');
    const expiry = localStorage.getItem('usermanager_admin_expiry');
    
    let isAdminActive = false;
    if (savedAdmin && expiry) {
        if (Date.now() < parseInt(expiry)) {
            isAdminActive = true;
            isAdmin = true;
            adminSessionId = savedAdmin;
            console.log('✅ Администратор: активная сессия');
        } else {
            // Очищаем просроченную сессию
            localStorage.removeItem('usermanager_admin_session');
            localStorage.removeItem('usermanager_admin_expiry');
            console.log('⚠️ Администратор: сессия истекла');
        }
    }
    
    // 2. Получаем режим с сервера
    try {
        const response = await fetch(`${CONFIG.API_URL}/mode`);
        if (response.ok) {
            const data = await response.json();
            currentServerMode = data.mode;
            console.log(`🌐 Режим сервера: ${currentServerMode}`);
            
            // 3. ЕСЛИ РЕЖИМ ЛОКАЛЬНЫЙ И МЫ НЕ АДМИН - БЛОКИРУЕМ ДОСТУП
            if (currentServerMode === 'local' && !isAdminActive) {
                showBlockedPage();
                return;
            }
        }
    } catch (error) {
        console.log('Не удалось получить режим с сервера:', error);
        currentServerMode = "server";
    }
    
    // 4. Настройка режима для пользователя
    if (!isAdminActive) {
        // Гость - всегда серверный режим
        CONFIG.USE_REAL_API = true;
        localStorage.setItem('usermanager_use_real_api', 'true');
        isAdmin = false;
        console.log('🌐 Гость: установлен серверный режим');
    } else {
        // Админ - загружаем его настройки
        const savedMode = localStorage.getItem('usermanager_use_real_api');
        CONFIG.USE_REAL_API = savedMode !== 'false'; // true по умолчанию
        console.log(`👑 Администратор: ${CONFIG.USE_REAL_API ? 'Серверный' : 'Локальный'} режим`);
    }
    
    // 5. Обновляем кнопки
    updateAdminUI();
}

// Показывает страницу блокировки для обычных пользователей в локальном режиме
function showBlockedPage() {
    console.log('🚫 Локальный режим: доступ заблокирован для гостя');
    
    // Блокируем весь контент
    const body = document.body;
    if (!body) return;
    
    body.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0a192f 0%, #1a365d 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            text-align: center;
            padding: 2rem;
            z-index: 99999;
        ">
            <div style="font-size: 5rem; margin-bottom: 2rem;">🔒</div>
            <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">Доступ временно ограничен</h1>
            <p style="font-size: 1.2rem; color: #bbdefb; max-width: 600px; margin-bottom: 2rem;">
                Администратор работает в локальном режиме. Сайт временно недоступен для публичного доступа.
            </p>
            <div style="
                background: rgba(255, 255, 255, 0.1);
                padding: 1.5rem;
                border-radius: 15px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                max-width: 500px;
                margin-bottom: 2rem;
            ">
                <p style="color: #94a3b8;">Попробуйте зайти позже или свяжитесь с администратором.</p>
            </div>
            <button onclick="location.reload()" style="
                background: linear-gradient(45deg, #3b82f6, #1d4ed8);
                color: white;
                border: none;
                padding: 1rem 2rem;
                border-radius: 10px;
                font-size: 1.1rem;
                cursor: pointer;
                margin-top: 1rem;
            ">
                🔄 Обновить страницу
            </button>
        </div>
    `;
}

// Вызываем инициализацию сразу
initializeSystem();

// Функция для изменения режима на сервере
async function changeServerMode(newMode) {
    try {
        console.log(`🔄 Отправка запроса на изменение режима на: ${newMode}`);
        
        const response = await fetch(`${CONFIG.API_URL}/admin/mode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Password': ADMIN_PASSWORD
            },
            body: JSON.stringify({
                mode: newMode,
                password: ADMIN_PASSWORD
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            currentServerMode = newMode;
            console.log(`✅ Режим сервера изменен на: ${newMode}`);
            return data;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка изменения режима');
        }
    } catch (error) {
        console.error('Ошибка изменения режима сервера:', error);
        throw error;
    }
}

// Проверка администратора
function checkAdminAccess() {
    const savedSession = localStorage.getItem('usermanager_admin_session');
    const sessionExpiry = localStorage.getItem('usermanager_admin_expiry');

    if (savedSession && sessionExpiry) {
        const now = Date.now();
        if (now < parseInt(sessionExpiry)) {
            isAdmin = true;
            adminSessionId = savedSession;
            return true;
        } else {
            // Сессия истекла - полный выход
            logoutAdmin();
            return false;
        }
    }

    return false;
}

// Создание сессии администратора
function createAdminSession() {
    const sessionId = 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const expiryTime = Date.now() + (24 * 60 * 60 * 1000); // 24 часа

    localStorage.setItem('usermanager_admin_session', sessionId);
    localStorage.setItem('usermanager_admin_expiry', expiryTime.toString());
    // По умолчанию серверный режим для нового админа
    localStorage.setItem('usermanager_use_real_api', 'true');

    adminSessionId = sessionId;
    isAdmin = true;

    console.log('✅ Администратор: новая сессия создана');
}

// Выход администратора - ПОЛНАЯ ОЧИСТКА
function logoutAdmin() {
    console.log('🚪 Выход администратора...');
    
    // Полностью очищаем ВСЕ данные админа
    localStorage.removeItem('usermanager_admin_session');
    localStorage.removeItem('usermanager_admin_expiry');
    localStorage.removeItem('usermanager_use_real_api');
    
    // Сбрасываем переменные
    isAdmin = false;
    adminSessionId = null;
    CONFIG.USE_REAL_API = true;
    currentServerMode = "server";
    
    // ОБЯЗАТЕЛЬНО проверяем текущий режим сервера
    fetch(`${CONFIG.API_URL}/mode`)
        .then(response => response.json())
        .then(data => {
            if (data.mode === 'local') {
                // Если сервер все еще в локальном режиме, показываем блокировку
                showBlockedPage();
            } else {
                // Иначе перезагружаем как обычный пользователь
                alert('✅ Вы вышли из режима администратора.');
                location.reload();
            }
        })
        .catch(() => {
            alert('✅ Вы вышли из режима администратора.');
            location.reload();
        });
}

// Функция переключения режима работы
async function toggleServerMode() {
    if (!checkAdminAccess()) {
        showAdminLoginModal();
        return;
    }
    
    try {
        const newMode = CONFIG.USE_REAL_API ? 'local' : 'server';
        
        // Меняем режим на сервере
        await changeServerMode(newMode);
        
        // Обновляем локальные настройки
        CONFIG.USE_REAL_API = !CONFIG.USE_REAL_API;
        localStorage.setItem('usermanager_use_real_api', CONFIG.USE_REAL_API ? 'true' : 'false');
        currentServerMode = newMode;
        
        if (newMode === 'local') {
            alert('✅ Локальный режим включен\nСайт теперь недоступен для других пользователей.');
        } else {
            alert('✅ Серверный режим включен\nСайт теперь доступен для всех пользователей.');
        }
        
        // Перезагружаем страницу
        setTimeout(() => location.reload(), 1000);
        
    } catch (error) {
        console.error('Ошибка переключения режима:', error);
        alert(`❌ Ошибка: ${error.message}`);
    }
}

// Обновление UI администратора
function updateAdminUI() {
    const adminBtn = document.getElementById('adminModeToggle');
    const loginBtn = document.querySelector('.nav-item[onclick*="showAdminLoginModal"]');
    const logoutBtn = document.getElementById('adminLogoutBtn');
    
    // Проверяем активность админа
    const savedAdmin = localStorage.getItem('usermanager_admin_session');
    const expiry = localStorage.getItem('usermanager_admin_expiry');
    const isAdminActive = savedAdmin && expiry && Date.now() < parseInt(expiry);
    
    if (isAdminActive) {
        // ПОКАЗЫВАЕМ кнопку режима
        if (adminBtn) {
            adminBtn.style.display = 'flex';
            const isLocalMode = localStorage.getItem('usermanager_use_real_api') === 'false';
            adminBtn.innerHTML = `
                <i class="fas fa-cogs"></i>
                <span>Режим: ${isLocalMode ? 'Локальный' : 'Серверный'}</span>
            `;
            adminBtn.onclick = function(e) {
                e.preventDefault();
                toggleServerMode();
            };
        }
        
        // Скрываем кнопку входа
        if (loginBtn) {
            loginBtn.style.display = 'none';
        }
        
        // Добавляем кнопку выхода
        addLogoutButton();
        
    } else {
        // СКРЫВАЕМ кнопку режима
        if (adminBtn) {
            adminBtn.style.display = 'none';
            adminBtn.onclick = null;
        }
        
        // Показываем кнопку входа
        if (loginBtn) {
            loginBtn.style.display = 'flex';
        }
        
        // Удаляем кнопку выхода
        removeLogoutButton();
    }
}

// Добавляет кнопку выхода
function addLogoutButton() {
    if (document.getElementById('adminLogoutBtn')) return;
    
    const logoutBtn = document.createElement('a');
    logoutBtn.id = 'adminLogoutBtn';
    logoutBtn.href = '#';
    logoutBtn.className = 'nav-item';
    logoutBtn.style.background = 'linear-gradient(45deg, #ef4444, #dc2626)';
    logoutBtn.innerHTML = `
        <i class="fas fa-sign-out-alt"></i>
        <span>Выйти</span>
    `;
    logoutBtn.onclick = function(e) {
        e.preventDefault();
        logoutAdmin();
    };
    
    // Вставляем в навигацию
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        navMenu.appendChild(logoutBtn);
    }
}

// Удаляет кнопку выхода
function removeLogoutButton() {
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.remove();
    }
}

// Модальное окно входа администратора (без изменений)
function showAdminLoginModal() {
    const modalHTML = `
        <div id="universalAdminModal" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.98);
            backdrop-filter: blur(20px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            animation: fadeIn 0.4s ease;
        ">
            <div style="
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
                border-radius: 28px;
                padding: 3.5rem 2.5rem;
                width: 90%;
                max-width: 500px;
                border: 2px solid rgba(96, 165, 250, 0.25);
                text-align: center;
                box-shadow: 
                    0 40px 100px rgba(0, 0, 0, 0.7),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
                animation: slideUp 0.5s ease;
                position: relative;
                overflow: hidden;
            ">
                <!-- Контент -->
                <div style="position: relative; z-index: 2;">
                    <div style="
                        width: 100px;
                        height: 100px;
                        margin: 0 auto 2rem;
                        background: linear-gradient(45deg, #3b82f6, #1d4ed8, #8b5cf6);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 3.5rem;
                        color: white;
                        box-shadow: 
                            0 20px 50px rgba(59, 130, 246, 0.4),
                            inset 0 4px 20px rgba(255, 255, 255, 0.3);
                        animation: pulse 2s infinite;
                    ">
                        👑
                    </div>

                    <h3 style="
                        color: white; 
                        margin-bottom: 0.75rem; 
font-size: 2.2rem;
                        font-weight: 800;
                        background: linear-gradient(45deg, #60a5fa, #a78bfa);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                    ">
                        Панель администратора
                    </h3>

                    <p style="
                        color: #cbd5e1; 
                        margin-bottom: 2.5rem; 
                        line-height: 1.6;
                        font-size: 1.1rem;
                        max-width: 400px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        Введите пароль для доступа к управлению системой.
                    </p>

                    <div style="margin-bottom: 2rem; position: relative;">
                        <input type="password" 
                               id="universalPasswordInput" 
                               placeholder="Пароль администратора" 
                               style="
                                   width: 100%;
                                   padding: 1.25rem 1.75rem;
                                   background: rgba(255, 255, 255, 0.07);
                                   border: 2px solid rgba(255, 255, 255, 0.15);
                                   border-radius: 16px;
                                   color: white;
                                   font-size: 1.1rem;
                                   text-align: center;
                                   font-family: 'Courier New', monospace;
                                   letter-spacing: 2px;
                                   transition: all 0.3s;
                                   outline: none;
                               ">
                    </div>

                    <div style="display: flex; gap: 1rem;">
                        <button onclick="universalAdminLogin()" style="
                            flex: 1;
                            padding: 1.25rem;
                            background: linear-gradient(45deg, #3b82f6, #1d4ed8);
                            border: none;
                            color: white;
                            border-radius: 14px;
                            cursor: pointer;
                            font-weight: 600;
                            font-size: 1rem;
                            transition: all 0.3s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 0.75rem;
                            box-shadow: 0 12px 35px rgba(59, 130, 246, 0.35);
                        ">
                            <span>🔓</span>
                            <span>Войти</span>
                        </button>
                    </div>

                    <div id="universalError" style="
                        color: #f87171;
                        margin-top: 2rem;
                        display: none;
                        font-size: 0.95rem;
                        padding: 1rem;
                        background: rgba(239, 68, 68, 0.1);
                        border-radius: 12px;
                        border: 1px solid rgba(239, 68, 68, 0.2);
                    ">
                        ❌ Неверный пароль
                    </div>
                </div>

                <!-- Кнопка закрытия -->
                <button onclick="universalCloseModal()" style="
                    position: absolute;
                    top: 1.5rem;
                    right: 1.5rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #94a3b8;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 1.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                ">
                    ×
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('universalPasswordInput').focus();
}

function universalCloseModal() {
    const modal = document.getElementById('universalAdminModal');
    if (modal) modal.remove();
}

function universalAdminLogin() {
    const passwordInput = document.getElementById('universalPasswordInput');
    const errorDiv = document.getElementById('universalError');
    
    if (!passwordInput) return;
    
    if (passwordInput.value === ADMIN_PASSWORD) {
        // Создаем сессию администратора
        createAdminSession();
        
        errorDiv.style.display = 'none';
        universalCloseModal();
        
        // Обновляем UI и перезагружаем
        updateAdminUI();
        alert('✅ Успешный вход как администратор!');
        setTimeout(() => location.reload(), 500);
    } else {
        errorDiv.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// ================== ОСНОВНАЯ ЛОГИКА ПРИЛОЖЕНИЯ ==================

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Обновляем UI админа
    updateAdminUI();
    
    // Если локальный режим и не админ - уже заблокировано в initializeSystem()
    
    // Загружаем данные если доступ разрешен
    if (currentServerMode === 'server' || isAdmin) {
        loadInitialData();
        setInterval(loadInitialData, 30000);
    }
});

// Локальное хранилище пользователей
let localUsers = [];

// Инициализация локальных данных
function initLocalData() {
    const savedData = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (savedData) {
        try {
            localUsers = JSON.parse(savedData);
        } catch (e) {
            localUsers = [];
        }
    } else {
        // Начальные данные
        localUsers = [
            {
                id: 1,
                name: "Алексей Иванов",
                email: "alex@example.com",
                created_at: new Date(Date.now() - 72 * 3600000).toISOString()
            },
            {
                id: 2,
                name: "Мария Петрова",
                email: "maria@example.com",
                created_at: new Date(Date.now() - 48 * 3600000).toISOString()
            },
            {
                id: 3,
                name: "Иван Сидоров",
                email: "ivan@company.ru",
                created_at: new Date(Date.now() - 24 * 3600000).toISOString()
            }
        ];
        saveLocalData();
    }
}

// Сохранение локальных данных
function saveLocalData() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(localUsers));
}

// Получение всех пользователей
async function getAllUsers() {
    if (CONFIG.USE_REAL_API) {
        try {
            const response = await fetch(`${CONFIG.API_URL}/users`);
            if (response.ok) {
                const users = await response.json();
                // Если сервер в локальном режиме, возвращаем пустой массив для всех кроме админа
                if (currentServerMode === 'local' && users.length === 0) {
                    return isAdmin ? localUsers : [];
                }
                return users;
            } else {
                throw new Error('Сервер недоступен');
            }
        } catch (error) {
            console.warn('Не удалось получить данные с сервера:', error);
            return localUsers;
        }
    } else {
        return localUsers;
    }
}

// Получение статистики
async function getStats() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/stats`);
        if (response.ok) {
            const stats = await response.json();
            
            // Если сервер в локальном режиме и мы не админ, показываем 0 пользователей
            if (stats.mode === 'local' && !isAdmin) {
                stats.total_users = 0;
                stats.message = "Локальный режим активен. Данные скрыты.";
            }
            
            return stats;
        } else {
            throw new Error('Сервер недоступен');
        }
    } catch (error) {
        console.warn('Не удалось получить статистику с сервера:', error);
        return {
            total_users: localUsers.length,
            server_time: new Date().toISOString(),
            status: 'local',
            version: '1.0.0',
            mode: 'local'
        };
    }
}

// Отображение пользователей
function displayUsers(users, containerId = 'usersGrid') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (users.length === 0) {
        // Показываем сообщение если нет пользователей
        if (currentServerMode === 'local' && !isAdmin) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #94a3b8;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                    <h3 style="color: #64748b; margin-bottom: 1rem;">Локальный режим активен</h3>
                    <p>В данный момент администратор работает в локальном режиме.</p>
                    <p>Данные временно недоступны для просмотра.</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #94a3b8;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">📭</div>
                    <h3 style="color: #64748b; margin-bottom: 1rem;">Нет пользователей</h3>
                    <p>База данных пуста. Добавьте первого пользователя.</p>
                </div>
            `;
        }
        return;
    }
    
    users.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'user-card';
        
        const createdDate = new Date(user.created_at);
        const formattedDate = createdDate.toLocaleDateString('ru-RU');
        
        userCard.innerHTML = `
            <div class="user-avatar">
                ${user.name.charAt(0)}
            </div>
            <div class="user-info">
                <div class="user-name">${user.name}</div>
                <div class="user-email">${user.email}</div>
                <div class="user-meta">
                    <span>ID: ${user.id}</span>
                    <span>Создан: ${formattedDate}</span>
                </div>
            </div>
            <div class="user-actions">
                <button class="btn-action btn-view" onclick="viewUser(${user.id})" title="Просмотр">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-action btn-edit" onclick="editUser(${user.id})" title="Редактировать">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action btn-delete" onclick="deleteUserConfirm(${user.id})" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        container.appendChild(userCard);
    });
}

// Обновление отображения статистики
function updateStatsDisplay(stats) {
    // Обновляем элементы статистики, если они есть на странице
    const totalUsersEl = document.getElementById('totalUsers');
    const activeUsersEl = document.getElementById('activeUsers');
    const statusEl = document.getElementById('statusValue');
    const modeTextEl = document.getElementById('currentModeText');
    
    if (totalUsersEl) totalUsersEl.textContent = stats.total_users || 0;
    if (activeUsersEl) activeUsersEl.textContent = stats.total_users || 0;
    if (statusEl) {
        if (stats.mode === 'local' && !isAdmin) {
            statusEl.textContent = 'Локально (заблокирован)';
            statusEl.style.color = '#ef4444';
        } else {
            statusEl.textContent = stats.status === 'online' ? 'Онлайн' : 'Локально';
            statusEl.style.color = stats.status === 'online' ? '#4ade80' : '#f59e0b';
        }
    }
    if (modeTextEl) {
        if (stats.mode === 'local' && !isAdmin) {
            modeTextEl.textContent = 'Режим: Локальный (доступ закрыт)';
        } else {
            modeTextEl.textContent = stats.mode === 'local' ? 'Режим: Локальный' : 'Режим: Серверный';
        }
    }
}

// Загрузка данных при старте
async function loadInitialData() {
    try {
        // Инициализируем локальные данные
        initLocalData();
        
        // Получаем статистику
        const stats = await getStats();
        updateStatsDisplay(stats);
        
        // Получаем и отображаем пользователей
        const users = await getAllUsers();
        displayUsers(users);
        
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        // Используем локальные данные в случае ошибки
        updateStatsDisplay({
            total_users: localUsers.length,
            status: 'local',
            mode: 'error'
        });
        displayUsers(localUsers);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация системы
    initializeSystem();
    
    // Загружаем данные
    loadInitialData();
    
    // Обновляем кнопку режима
    updateModeButton();
    
    // Периодическое обновление данных (каждые 30 секунд)
    setInterval(loadInitialData, 30000);
});

// Экспорт функций для использования в других файлах
window.checkAdminAccess = checkAdminAccess;
window.showAdminLoginModal = showAdminLoginModal;
window.toggleServerMode = toggleServerMode;
window.updateModeButton = updateModeButton;
window.changeServerMode = changeServerMode;
window.logoutAdmin = logoutAdmin;