// ============================================
// UserManager Pro - Адаптивный клиент
// Работает с Go API или локально
// ============================================

const CONFIG = {
    USE_REAL_API: false,
    API_URL: 'http://localhost:8068/api',
    STORAGE_KEY: 'usermanager_local_data'
};

// ================== СИСТЕМА АДМИНИСТРАТОРА ==================
const ADMIN_PASSWORD = "admin123"; // Только вы знаете этот пароль
let isAdmin = false;
let adminSessionId = null;

// Проверка администратора
function checkAdminAccess() {
    // Проверяем сохраненную сессию администратора
    const savedSession = localStorage.getItem('usermanager_admin_session');
    const sessionExpiry = localStorage.getItem('usermanager_admin_expiry');
    
    // Если есть активная сессия и она не истекла
    if (savedSession && sessionExpiry) {
        const now = Date.now();
        if (now < parseInt(sessionExpiry)) {
            isAdmin = true;
            adminSessionId = savedSession;
            console.log('✅ Администратор: активная сессия восстановлена');
            return true;
        } else {
            // Сессия истекла
            localStorage.removeItem('usermanager_admin_session');
            localStorage.removeItem('usermanager_admin_expiry');
            console.log('⚠️ Администратор: сессия истекла');
        }
    }
    
    // Проверяем GitHub Pages - там всегда только серверный режим
    const isGitHubPages = window.location.hostname.includes('github.io');
    
    if (isGitHubPages) {
        // На GitHub Pages всегда серверный режим без возможности переключения
        localStorage.setItem('usermanager_use_real_api', 'true');
        CONFIG.USE_REAL_API = true;
        isAdmin = false;
        return false;
    }

    return false;
}

// Создание сессии администратора
function createAdminSession() {
    // Генерируем уникальный ID сессии
    const sessionId = 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    // Устанавливаем срок действия сессии на 24 часа
    const expiryTime = Date.now() + (24 * 60 * 60 * 1000); // 24 часа
    
    localStorage.setItem('usermanager_admin_session', sessionId);
    localStorage.setItem('usermanager_admin_expiry', expiryTime.toString());
    
    adminSessionId = sessionId;
    isAdmin = true;
    
    console.log('✅ Администратор: новая сессия создана', sessionId);
}

// Окно входа для администратора
function showAdminLoginModal() {
    const modalHTML = `
        <div id="adminModal" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(15px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.5s ease;
        ">
            <div style="
                background: linear-gradient(135deg, rgba(26, 35, 126, 0.95), rgba(13, 71, 161, 0.95));
                border-radius: 25px;
                padding: 3rem 2rem;
                width: 90%;
                max-width: 450px;
                border: 2px solid rgba(96, 165, 250, 0.3);
                text-align: center;
                box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
                animation: slideUp 0.5s ease;
            ">
                <div style="
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 1.5rem;
                    background: linear-gradient(45deg, #3b82f6, #1d4ed8);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.5rem;
                    color: white;
                    box-shadow: 0 10px 30px rgba(59, 130, 246, 0.4);
                ">
                    👑
                </div>
                
                <h3 style="color: white; margin-bottom: 0.5rem; font-size: 1.8rem;">
                    Панель администратора
                </h3>
                
                <p style="color: #bbdefb; margin-bottom: 2rem; line-height: 1.5;">
                    Только администратор может управлять режимами работы системы.
                    Введите пароль администратора для доступа к панели управления.
                </p>
                
                <input type="password" 
                       id="adminPasswordInput" 
                       placeholder="Пароль администратора" 
                       style="
                           width: 100%;
                           padding: 1rem 1.5rem;
                           background: rgba(255, 255, 255, 0.08);
                           border: 2px solid rgba(255, 255, 255, 0.15);
                           border-radius: 12px;
                           color: white;
                           font-size: 1rem;
                           margin-bottom: 1.5rem;
                           text-align: center;
                           font-family: monospace;
                           letter-spacing: 1px;
                           transition: all 0.3s;
                       ">
                
                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <button onclick="continueAsGuest()" style="
                        flex: 1;
                        padding: 1rem;
                        background: rgba(255, 255, 255, 0.08);
                        border: 2px solid rgba(255, 255, 255, 0.15);
                        color: #bbdefb;
                        border-radius: 12px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.95rem;
                        transition: all 0.3s;
                    ">
                        Продолжить как гость
                    </button>
                    
                    <button onclick="submitAdminPassword()" style="
                        flex: 1;
                        padding: 1rem;
                        background: linear-gradient(45deg, #3b82f6, #1d4ed8);
                        border: none;
                        color: white;
                        border-radius: 12px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 0.95rem;
                        transition: all 0.3s;
                        box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
                    ">
                        Войти как администратор
                    </button>
                </div>
                
                <div id="adminError" style="
                    color: #f87171;
                    margin-top: 1.5rem;
                    display: none;
                    font-size: 0.9rem;
                ">
                    ❌ Неверный пароль администратора
                </div>
                
                <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    <p style="color: #94a3b8; font-size: 0.85rem; margin: 0;">
                        <strong>Режимы работы:</strong><br>
                        • <span style="color: #60a5fa;">🌐 Серверный</span> - доступен всем<br>
                        • <span style="color: #a78bfa;">🔒 Локальный</span> - только для администратора
                    </p>
                </div>
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.innerHTML = modalHTML;
    document.body.appendChild(modal);

    // Фокус на поле ввода
    setTimeout(() => {
        const input = document.getElementById('adminPasswordInput');
        if (input) {
            input.focus();
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    submitAdminPassword();
                }
            });
        }
    }, 100);
}

// Вход как администратор
function submitAdminPassword() {
    const input = document.getElementById('adminPasswordInput');
    const errorEl = document.getElementById('adminError');
    
    if (!input || !errorEl) return;

    if (input.value === ADMIN_PASSWORD) {
        // Создаем сессию администратора
        createAdminSession();
        
        // Закрываем модальное окно
        const modal = document.getElementById('adminModal');
        if (modal) modal.remove();
        
        // Обновляем UI
        updateApiModeUI();
        
        // Показываем уведомление
        showNotification('👑 Вы вошли как администратор. Сессия активна 24 часа.', 'success');
        
        // НЕ перезагружаем страницу, просто обновляем UI
        setTimeout(() => {
            // Обновляем состояние
            isAdmin = true;
            updateApiModeUI();
        }, 300);
    } else {
        // Показываем ошибку
        errorEl.style.display = 'block';
        input.style.borderColor = '#f87171';
        input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
        input.value = '';
        
        // Анимация ошибки
        input.style.animation = 'shake 0.5s';
        setTimeout(() => {
            input.style.animation = '';
        }, 500);
    }
}

// Продолжить как гость
function continueAsGuest() {
    // Устанавливаем серверный режим по умолчанию
    CONFIG.USE_REAL_API = true;
    localStorage.setItem('usermanager_use_real_api', 'true');
    isAdmin = false;
    
    // Удаляем сессию администратора если была
    localStorage.removeItem('usermanager_admin_session');
    localStorage.removeItem('usermanager_admin_expiry');
    
    // Закрываем модальное окно
    const modal = document.getElementById('adminModal');
    if (modal) modal.remove();
    
    // Обновляем UI
    updateApiModeUI();
    
    // Показываем уведомление
    showNotification('👋 Вы работаете в режиме гостя (серверный режим)', 'info');
}

// Выйти из администратора
function logoutAdmin() {
    // Удаляем сессию
    localStorage.removeItem('usermanager_admin_session');
    localStorage.removeItem('usermanager_admin_expiry');
    
    // Переключаемся на серверный режим
    CONFIG.USE_REAL_API = true;
    localStorage.setItem('usermanager_use_real_api', 'true');
    isAdmin = false;
    
    // Обновляем UI
    updateApiModeUI();
    
    // Показываем уведомление
    showNotification('👋 Вы вышли из режима администратора', 'info');
}

// ================== УПРАВЛЕНИЕ РЕЖИМАМИ ==================
function toggleApiMode() {
    console.log('toggleApiMode вызван, isAdmin:', isAdmin);
    
    // Если не администратор, показываем окно входа
    if (!isAdmin) {
        showNotification('🔒 Только администратор может переключать режимы', 'warning');
        showAdminLoginModal();
        return;
    }

    // Только администратор может переключать режимы
    const currentMode = localStorage.getItem('usermanager_use_real_api');
    const newMode = currentMode === 'false' ? 'true' : 'false';

    console.log('Переключение режима:', currentMode, '->', newMode);

    // Сохраняем новый режим
    localStorage.setItem('usermanager_use_real_api', newMode);
    CONFIG.USE_REAL_API = (newMode === 'true');

    // Уведомление
    const isServerMode = newMode === 'true';
    const message = isServerMode
        ? '🌐 Администратор включил СЕРВЕРНЫЙ режим'
        : '🔒 Администратор включил ЛОКАЛЬНЫЙ режим';

    showNotification(message, isServerMode ? 'info' : 'warning');

    // Обновляем UI
    updateApiModeUI();
    if (typeof updateServerStatus === 'function') {
        updateServerStatus();
    }

    // Перезагружаем данные
    setTimeout(() => {
        if (typeof loadUsers === 'function') {
            loadUsers();
        }
    }, 300);
}

function updateApiModeUI() {
    console.log('updateApiModeUI вызван, isAdmin:', isAdmin, 'CONFIG.USE_REAL_API:', CONFIG.USE_REAL_API);
    
    const button = document.getElementById('apiModeButton');
    const icon = document.getElementById('apiModeIcon');
    const text = document.getElementById('apiModeText');
    const status = document.getElementById('apiStatus');

    if (CONFIG.USE_REAL_API) {
        if (icon) icon.textContent = '🌐';
        if (text) text.textContent = 'Серверный';
        if (button) {
            button.title = isAdmin ? 
                'Администратор: переключить на локальный режим' : 
                'Только администратор может менять режим';
            button.style.background = 'rgba(59, 130, 246, 0.2)';
            button.style.borderColor = 'rgba(59, 130, 246, 0.4)';
            button.disabled = !isAdmin;
            button.style.opacity = isAdmin ? '1' : '0.5';
            button.style.cursor = isAdmin ? 'pointer' : 'not-allowed';
            button.onclick = isAdmin ? toggleApiMode : function() {
                showNotification('🔒 Только администратор может переключать режимы', 'warning');
                showAdminLoginModal();
            };
        }
        if (status) {
            status.textContent = 'Серверный режим';
            status.style.color = '#60a5fa';
        }
    } else {
        if (icon) icon.textContent = '🔒';
        if (text) text.textContent = 'Локальный';
        if (button) {
            button.title = isAdmin ? 
                'Администратор: переключить на серверный режим' : 
                'Только администратор может менять режим';
            button.style.background = 'rgba(139, 92, 246, 0.2)';
            button.style.borderColor = 'rgba(139, 92, 246, 0.4)';
            button.disabled = !isAdmin;
            button.style.opacity = isAdmin ? '1' : '0.5';
            button.style.cursor = isAdmin ? 'pointer' : 'not-allowed';
            button.onclick = isAdmin ? toggleApiMode : function() {
                showNotification('🔒 Только администратор может переключать режимы', 'warning');
                showAdminLoginModal();
            };
        }
        if (status) {
            status.textContent = 'Локальный режим';
            status.style.color = '#a78bfa';
        }
    }

    // Обновляем кнопку администратора
    updateAdminButtonUI();
}

// Кнопка администратора
function updateAdminButtonUI() {
    console.log('updateAdminButtonUI вызван, isAdmin:', isAdmin);
    
    let adminBtn = document.getElementById('adminButton');
    
    if (!adminBtn && document.querySelector('.nav-menu')) {
        // Создаем кнопку администратора если ее нет
        adminBtn = document.createElement('button');
        adminBtn.id = 'adminButton';
        adminBtn.className = 'api-mode-btn';
        adminBtn.innerHTML = isAdmin ? 
            '<span>👑</span><span>Администратор</span>' : 
            '<span>🔐</span><span>Войти</span>';
        adminBtn.title = isAdmin ? 'Выйти из режима администратора' : 'Войти как администратор';
        adminBtn.onclick = isAdmin ? logoutAdmin : showAdminLoginModal;
        
        // Добавляем кнопку в навигацию
        const navMenu = document.querySelector('.nav-menu');
        if (navMenu) {
            // Вставляем перед кнопкой переключения темы
            const themeToggle = document.querySelector('.theme-toggle-container');
            if (themeToggle) {
                navMenu.insertBefore(adminBtn, themeToggle);
            } else {
                navMenu.appendChild(adminBtn);
            }
        }
    } else if (adminBtn) {
        // Обновляем существующую кнопку
        adminBtn.innerHTML = isAdmin ? 
            '<span>👑</span><span>Администратор</span>' : 
            '<span>🔐</span><span>Войти</span>';
        adminBtn.title = isAdmin ? 'Выйти из режима администратора' : 'Войти как администратор';
        adminBtn.onclick = isAdmin ? logoutAdmin : showAdminLoginModal;
        
        // Стили для администратора
        if (isAdmin) {
            adminBtn.style.background = 'rgba(245, 158, 11, 0.2)';
            adminBtn.style.borderColor = 'rgba(245, 158, 11, 0.4)';
            adminBtn.style.color = '#fbbf24';
            adminBtn.style.fontWeight = '600';
        } else {
            adminBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            adminBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            adminBtn.style.color = '#bbdefb';
        }
    }
}

// ================== ИНИЦИАЛИЗАЦИЯ РЕЖИМА ==================
function initApiMode() {
    console.log('=== ИНИЦИАЛИЗАЦИЯ РЕЖИМА API ===');

    // Проверяем права администратора (восстанавливаем сессию)
    checkAdminAccess();

    // Проверяем сохраненный режим из localStorage
    const savedMode = localStorage.getItem('usermanager_use_real_api');

    // Если режим не сохранен, устанавливаем по умолчанию
    if (savedMode === null) {
        // По умолчанию - серверный режим
        CONFIG.USE_REAL_API = true;
        localStorage.setItem('usermanager_use_real_api', 'true');
    } else {
        CONFIG.USE_REAL_API = (savedMode === 'true');
    }

    console.log('Текущий режим:', CONFIG.USE_REAL_API ? 'СЕРВЕРНЫЙ' : 'ЛОКАЛЬНЫЙ');
    console.log('Администратор:', isAdmin ? 'ДА' : 'НЕТ');

    // Если локальный режим и не администратор, переключаем на серверный
    if (!CONFIG.USE_REAL_API && !isAdmin) {
        console.log('⚠️ Локальный режим без администратора - переключаем на серверный');
        CONFIG.USE_REAL_API = true;
        localStorage.setItem('usermanager_use_real_api', 'true');
        
        // Показываем уведомление
        setTimeout(() => {
            showNotification('🔒 Локальный режим доступен только администратору', 'warning');
        }, 1000);
    }

    // Обновляем UI
    updateApiModeUI();
    if (typeof updateServerStatus === 'function') {
        updateServerStatus();
    }
}

// ================== ОСТАЛЬНАЯ ЧАСТЬ ФАЙЛА ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ ==================
// (Оставьте весь остальной код из предыдущей версии, начиная с МОК-API ДЛЯ GITHUB PAGES)
// ================== МОК-API ДЛЯ GITHUB PAGES ==================
const MOCK_USERS = [
    {
        id: 1,
        name: "Иван Петров",
        email: "ivan@example.com",
        role: "Администратор",
        status: "active",
        createdAt: "2024-01-15T10:30:00Z",
        lastLogin: "2024-03-20T14:25:00Z"
    },
    {
        id: 2,
        name: "Мария Сидорова",
        email: "maria@example.com",
        role: "Менеджер",
        status: "active",
        createdAt: "2024-02-10T09:15:00Z",
        lastLogin: "2024-03-19T11:45:00Z"
    },
    {
        id: 3,
        name: "Алексей Иванов",
        email: "alex@example.com",
        role: "Пользователь",
        status: "inactive",
        createdAt: "2024-03-01T16:20:00Z",
        lastLogin: "2024-03-05T10:10:00Z"
    },
    {
        id: 4,
        name: "Екатерина Смирнова",
        email: "ekaterina@example.com",
        role: "Редактор",
        status: "active",
        createdAt: "2024-01-25T13:40:00Z",
        lastLogin: "2024-03-21T09:30:00Z"
    },
    {
        id: 5,
        name: "Дмитрий Кобелев",
        email: "dmitry@example.com",
        role: "Разработчик",
        status: "active",
        createdAt: "2024-03-10T08:00:00Z",
        lastLogin: "2024-03-22T17:15:00Z"
    }
];

// Мок-функции для API
const mockApi = {
    async getUsers() {
        await new Promise(resolve => setTimeout(resolve, 300));
        return {
            success: true,
            users: [...MOCK_USERS]
        };
    },

    async createUser(userData) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const newUser = {
            id: Date.now(),
            ...userData,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };
        MOCK_USERS.push(newUser);
        return {
            success: true,
            user: newUser,
            message: "Пользователь создан"
        };
    },

    async updateUser(id, userData) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const index = MOCK_USERS.findIndex(u => u.id === id);
        if (index === -1) {
            return {
                success: false,
                error: "Пользователь не найден"
            };
        }
        MOCK_USERS[index] = { ...MOCK_USERS[index], ...userData };
        return {
            success: true,
            user: MOCK_USERS[index],
            message: "Пользователь обновлен"
        };
    },

    async deleteUser(id) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const index = MOCK_USERS.findIndex(u => u.id === id);
        if (index === -1) {
            return {
                success: false,
                error: "Пользователь не найден"
            };
        }
        MOCK_USERS.splice(index, 1);
        return {
            success: true,
            message: "Пользователь удален"
        };
    }
};

let localUsers = [];

// ================== ИНИЦИАЛИЗАЦИЯ ДАННЫХ ==================
function initLocalData() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
        localUsers = JSON.parse(saved);
    } else {
        localUsers = [
            {
                id: 1,
                name: "Алексей Иванов",
                email: "alex@example.com",
                created_at: new Date(Date.now() - 86400000 * 3).toISOString()
            },
            {
                id: 2,
                name: "Мария Петрова",
                email: "maria@example.com",
                created_at: new Date(Date.now() - 86400000 * 2).toISOString()
            },
            {
                id: 3,
                name: "Иван Сидоров",
                email: "ivan@company.ru",
                created_at: new Date(Date.now() - 86400000).toISOString()
            }
        ];
        saveLocalData();
    }
    updateStats();
}

function saveLocalData() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(localUsers));
    updateStats();
}

function updateStats() {
    const element = document.getElementById('totalUsers');
    if (element) {
        element.textContent = CONFIG.USE_REAL_API ?
            'Загрузка...' : localUsers.length;
    }
}

// ================== API КЛИЕНТ ==================
async function apiRequest(url, options = {}) {
    console.log(`[${CONFIG.USE_REAL_API ? 'СЕРВЕР' : 'ЛОКАЛЬНЫЙ'}] ${options.method || 'GET'} ${url}`);

    if (CONFIG.USE_REAL_API) {
        try {
            return await realApiRequest(url, options);
        } catch (error) {
            console.error('Ошибка серверного API:', error);

            // Если сервер недоступен, показываем уведомление
            showNotification('⚠️ Сервер Go API недоступен', 'warning');
            throw error;
        }
    } else {
        // Локальный режим - используем мок-данные
        return await mockApiRequest(url, options);
    }
}

async function realApiRequest(url, options = {}) {
    try {
        const response = await fetch(CONFIG.API_URL + url.replace('/api', ''), {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.status === 204 ? null : await response.json();
    } catch (error) {
        console.error('Real API error:', error);
        showNotification('⚠️ Ошибка соединения с сервером', 'warning');
        throw error;
    }
}

async function mockApiRequest(url, options = {}) {
    await new Promise(resolve => setTimeout(resolve, 200));

    const method = options.method || 'GET';

    if (url === '/api/stats') {
        return {
            total_users: localUsers.length,
            server_time: new Date().toISOString(),
            status: "online (локальный режим)",
            version: "1.0.0"
        };
    }

    if (url === '/api/users' || url.startsWith('/api/users/')) {
        const id = url.match(/\/api\/users\/(\d+)/)?.[1];

        switch (method) {
            case 'GET':
                if (id) {
                    const user = localUsers.find(u => u.id == id);
                    if (!user) throw new Error('User not found');
                    return user;
                }
                return [...localUsers];

            case 'POST':
                const newUser = JSON.parse(options.body || '{}');
                newUser.id = Date.now();
                newUser.created_at = new Date().toISOString();
                localUsers.push(newUser);
                saveLocalData();
                return newUser;

            case 'PUT':
                if (!id) throw new Error('ID required');
                const updateData = JSON.parse(options.body || '{}');
                const index = localUsers.findIndex(u => u.id == id);
                if (index === -1) throw new Error('User not found');

                localUsers[index] = { ...localUsers[index], ...updateData };
                saveLocalData();
                return localUsers[index];

            case 'DELETE':
                if (!id) throw new Error('ID required');
                const deleteIndex = localUsers.findIndex(u => u.id == id);
                if (deleteIndex === -1) throw new Error('User not found');

                localUsers.splice(deleteIndex, 1);
                saveLocalData();
                return null;

            default:
                throw new Error('Method not allowed');
        }
    }

    throw new Error('Endpoint not found');
}

// ================== ОСНОВНЫЕ ФУНКЦИИ ==================
async function loadUsers() {
    console.log('loadUsers: GitHub=', window.location.hostname.includes('github.io'), 'API=', CONFIG.USE_REAL_API);

    const isGitHubPages = window.location.hostname.includes('github.io');

    if (isGitHubPages && CONFIG.USE_REAL_API) {
        console.log('✅ Используем мок-данные на GitHub Pages');
        showLoading(true);
        try {
            const result = await mockApi.getUsers();
            console.log('Мок-данные получены:', result.users.length, 'пользователей');
            displayUsers(result.users);
            updateStats(result.users.length);
            showNotification(`Загружено ${result.users.length} тестовых пользователей`, 'success');
        } catch (error) {
            console.error('Ошибка загрузки мок-данных:', error);
            showNotification('Ошибка загрузки тестовых данных', 'error');
        } finally {
            showLoading(false);
        }
        return;
    }

    showLoading(true);
    try {
        const users = await apiRequest('/api/users');
        displayUsers(users);
    } catch (error) {
        console.error('Failed to load users:', error);
        showNotification('Ошибка загрузки пользователей', 'error');
    } finally {
        showLoading(false);
    }
}

async function createUser(userData) {
    const isGitHubPages = window.location.hostname.includes('github.io');

    if (isGitHubPages && CONFIG.USE_REAL_API) {
        console.log('Создание тестового пользователя');
        const result = await mockApi.createUser(userData);
        if (result.success) {
            showNotification(result.message, 'success');
            loadUsers();
        }
        return;
    }

    return await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify(userData)
    });
}

async function updateUser(id, userData) {
    const isGitHubPages = window.location.hostname.includes('github.io');

    if (isGitHubPages && CONFIG.USE_REAL_API) {
        console.log('Обновление тестового пользователя');
        const result = await mockApi.updateUser(id, userData);
        if (result.success) {
            showNotification(result.message, 'success');
            loadUsers();
        }
        return;
    }

    return await apiRequest(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(userData)
    });
}

async function deleteUser(id) {
    const isGitHubPages = window.location.hostname.includes('github.io');

    if (isGitHubPages && CONFIG.USE_REAL_API) {
        console.log('Удаление тестового пользователя');
        const result = await mockApi.deleteUser(id);
        if (result.success) {
            showNotification(result.message, 'success');
            loadUsers();
        }
        return;
    }

    return await apiRequest(`/api/users/${id}`, {
        method: 'DELETE'
    });
}

// ================== ОТОБРАЖЕНИЕ ==================
function displayUsers(usersArray) {
    const grid = document.getElementById('usersGrid');
    const emptyState = document.getElementById('emptyState');

    if (!usersArray || usersArray.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (grid) grid.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    if (grid) {
        grid.innerHTML = usersArray.map(user => `
            <div class="feature-card" style="text-align: left; display: flex; align-items: center; gap: 1.5rem; animation: fadeIn 0.5s ease;">
                <div style="width: 60px; height: 60px; background: linear-gradient(45deg, #3b82f6, #1d4ed8); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.2rem;">
                    ${getInitials(user.name)}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 1.2rem; color: white;">${escapeHtml(user.name)}</div>
                    <div style="color: #bbdefb; margin-bottom: 0.5rem;">${escapeHtml(user.email)}</div>
                    <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;">
                        Создан: ${formatDate(user.created_at)}
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="editUser(${user.id})" class="btn-edit">
                            ✏️ Редактировать
                        </button>
                        <button onclick="deleteUserConfirm(${user.id})" class="btn-delete">
                            🗑️ Удалить
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function getInitials(name) {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Неизвестно';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================== ФОРМА ==================
async function saveUser(event) {
    event.preventDefault();

    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const userId = document.getElementById('userId')?.value;

    if (!name || !email) {
        showNotification('Заполните все поля', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showNotification('Введите корректный email', 'error');
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Сохранение...';

        if (userId) {
            await updateUser(userId, { name, email });
            showNotification('✅ Пользователь обновлен', 'success');
        } else {
            await createUser({ name, email });
            showNotification('✅ Пользователь добавлен', 'success');
        }

        closeModal();
        await loadUsers();

        if (typeof refreshCharts === 'function') {
            setTimeout(refreshCharts, 500);
        }

    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('❌ Ошибка сохранения', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ================== РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ ==================
async function editUser(id) {
    try {
        const user = await apiRequest(`/api/users/${id}`);
        openModal(user);
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showNotification('❌ Пользователь не найден', 'error');
    }
}

async function deleteUserConfirm(id) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
        return;
    }

    try {
        await deleteUser(id);
        showNotification('✅ Пользователь удален', 'success');
        await loadUsers();

        if (typeof refreshCharts === 'function') {
            setTimeout(refreshCharts, 500);
        }

    } catch (error) {
        console.error('Ошибка удаления:', error);
        showNotification('❌ Ошибка удаления', 'error');
    }
}

// ================== МОДАЛЬНОЕ ОКНО ==================
function openModal(user = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('userForm');

    if (!modal || !title || !form) return;

    if (user) {
        title.textContent = '✏️ Редактировать пользователя';
        document.getElementById('userId').value = user.id;
        document.getElementById('userName').value = user.name;
        document.getElementById('userEmail').value = user.email;
    } else {
        title.textContent = '➕ Добавить пользователя';
        document.getElementById('userId').value = '';
        form.reset();
    }

    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('userModal');
    if (!modal) return;

    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

// ================== ПОИСК ==================
function searchUsers(query) {
    const cards = document.querySelectorAll('.feature-card');
    const emptyState = document.getElementById('emptyState');
    let found = false;

    cards.forEach(card => {
        const name = card.querySelector('div:nth-child(2) > div:first-child')?.textContent || '';
        const email = card.querySelector('div:nth-child(2) > div:nth-child(2)')?.textContent || '';

        if (name.toLowerCase().includes(query.toLowerCase()) ||
            email.toLowerCase().includes(query.toLowerCase())) {
            card.style.display = 'flex';
            found = true;
        } else {
            card.style.display = 'none';
        }
    });

    if (!found && query && emptyState) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 3rem;">🔍</div>
                <h3 style="margin: 1rem 0;">Ничего не найдено</h3>
                <p>Попробуйте изменить запрос</p>
            </div>
        `;
    } else if (emptyState) {
        emptyState.style.display = 'none';
    }
}

// ================== ДЕМО ДАННЫЕ ==================
async function loadDemoData() {
    if (!confirm('Добавить демо-данные? Существующие пользователи останутся.')) {
        return;
    }

    showNotification('Добавляем демо-данные...', 'info');

    const demoUsers = [
        { name: "Ольга Новикова", email: "olga@mail.ru" },
        { name: "Сергей Морозов", email: "sergey@gmail.com" },
        { name: "Анна Волкова", email: "anna@company.com" },
        { name: "Павел Козлов", email: "pavel@yandex.ru" },
        { name: "Елена Захарова", email: "elena@example.com" }
    ];

    for (const user of demoUsers) {
        try {
            await createUser(user);
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error('Ошибка:', error);
        }
    }

    await loadUsers();
    showNotification('✅ Демо-данные добавлены!', 'success');
}

// ================== УТИЛИТЫ ==================
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = show ? 'block' : 'none';
        if (show) {
            loading.innerHTML = '<div class="spinner"></div> Загрузка...';
        }
    }
}

function showNotification(message, type = 'success') {
    const oldNotifications = document.querySelectorAll('.notification');
    oldNotifications.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;

    const colors = {
        success: '#4ade80',
        error: '#f87171',
        warning: '#fbbf24',
        info: '#60a5fa'
    };

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-weight: 500;
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Функция для получения пользователей для графиков
function getUsersForCharts() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
        return JSON.parse(saved);
    }
    return [];
}

// Проверка статуса сервера
async function checkApiStatus() {
    if (!CONFIG.USE_REAL_API) {
        const statusEl = document.getElementById('serverStatus');
        if (statusEl) {
            statusEl.innerHTML = '🔒 Локальный';
            statusEl.style.color = '#a78bfa';
        }
        return;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(CONFIG.API_URL.replace('/api', '') + '/health', {
            method: 'GET',
            signal: controller.signal
        }).catch(() => null);

        clearTimeout(timeoutId);

        const statusEl = document.getElementById('serverStatus');
        if (statusEl) {
            if (response && response.ok) {
                statusEl.innerHTML = '🟢 Онлайн';
                statusEl.style.color = '#4ade80';
            } else {
                statusEl.innerHTML = '🔴 Офлайн';
                statusEl.style.color = '#f87171';
            }
        }
    } catch (error) {
        console.log('Проверка статуса:', error.message);
        const statusEl = document.getElementById('serverStatus');
        if (statusEl) {
            statusEl.innerHTML = '🔴 Ошибка';
            statusEl.style.color = '#f87171';
        }
    }
}

// ================== ИНИЦИАЛИЗАЦИЯ ==================
document.addEventListener('DOMContentLoaded', function () {
    console.log('=== ЗАГРУЗКА СТРАНИЦЫ ===');
    
    // Инициализация режима API (восстанавливает сессию администратора)
    initApiMode();
    
    // Обычная инициализация
    initLocalData();
    loadUsers();

    const form = document.getElementById('userForm');
    if (form) {
        form.onsubmit = saveUser;

        if (!document.getElementById('userId')) {
            const idInput = document.createElement('input');
            idInput.type = 'hidden';
            idInput.id = 'userId';
            idInput.name = 'userId';
            form.appendChild(idInput);
        }
    }

    document.addEventListener('click', function (e) {
        if (e.target.id === 'userModal' || e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
    });

    window.getUsersForCharts = getUsersForCharts;
    window.loadDemoData = loadDemoData;
    
    // Проверяем сессию администратора каждые 30 минут
    setInterval(() => {
        if (isAdmin) {
            checkAdminAccess(); // Обновляем статус сессии
        }
    }, 30 * 60 * 1000);
});

// ================== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==================
window.openModal = openModal;
window.closeModal = closeModal;
window.editUser = editUser;
window.deleteUserConfirm = deleteUserConfirm;
window.searchUsers = searchUsers;
window.loadUsers = loadUsers;
window.loadDemoData = loadDemoData;
window.getUsersForCharts = getUsersForCharts;
window.toggleApiMode = toggleApiMode;
window.updateApiModeUI = updateApiModeUI;
window.checkApiStatus = checkApiStatus;
window.initApiMode = initApiMode;
window.showAdminLoginModal = showAdminLoginModal;
window.submitAdminPassword = submitAdminPassword;
window.logoutAdmin = logoutAdmin;
window.continueAsGuest = continueAsGuest;

// ================== СТИЛИ ==================
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
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
        border: 2px solid rgba(255,255,255,.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 0.8s linear infinite;
        margin-right: 8px;
        vertical-align: middle;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .btn-edit {
        background: rgba(59, 130, 246, 0.2);
        border: 1px solid rgba(59, 130, 246, 0.4);
        color: #93c5fd;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
    }
    
    .btn-edit:hover {
        background: rgba(59, 130, 246, 0.3);
    }
    
    .btn-delete {
        background: rgba(239, 68, 68, 0.2);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #fca5a5;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
    }
    
    .btn-delete:hover {
        background: rgba(239, 68, 68, 0.3);
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    
    @keyframes slideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    
    .api-mode-btn:disabled {
        cursor: not-allowed !important;
        opacity: 0.5 !important;
    }
`;
document.head.appendChild(style);