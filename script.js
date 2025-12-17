// ============================================
// UserManager Pro - Адаптивный клиент
// Работает с Go API или локально
// ============================================

// Принудительное обновление кеша при загрузке
(function() {
    // Проверяем версию в localStorage
    const CURRENT_VERSION = '2.0.1';
    const savedVersion = localStorage.getItem('usermanager_version');
    
    if (savedVersion !== CURRENT_VERSION) {
        console.log('🔄 Обновление версии с', savedVersion, 'на', CURRENT_VERSION);
        
        // Очищаем localStorage для обновления
        localStorage.removeItem('usermanager_local_data');
        localStorage.removeItem('usermanager_use_real_api');
        
        // Сохраняем новую версию
        localStorage.setItem('usermanager_version', CURRENT_VERSION);
        
        // Принудительно перезагружаем страницу один раз
        if (!sessionStorage.getItem('already_reloaded')) {
            sessionStorage.setItem('already_reloaded', 'true');
            console.log('🔄 Принудительная перезагрузка для обновления');
            setTimeout(() => {
                window.location.reload(true); // true = игнорировать кеш
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
    USE_REAL_API: false,
    API_URL: 'http://localhost:8068/api',
    STORAGE_KEY: 'usermanager_local_data',
    VERSION: '2.0.1',
    LAST_UPDATE: '<?php echo date("Y-m-d H:i:s"); ?>'
};

// ================== СИСТЕМА до АДМИНИСТРАТОРА ==================
const ADMIN_PASSWORD = "admin123"; // Только вы знаете этот пароль
let isAdmin = false;
let adminSessionId = null;
let currentServerMode = "server"; // Храним текущий режим сервера

// Проверка и инициализация режима при загрузке
async function initializeSystem() {
    // Проверяем GitHub Pages - всегда серверный режим для гостей
    const isGitHubPages = window.location.hostname.includes('github.io');
    const savedAdmin = localStorage.getItem('usermanager_admin_session');
    const expiry = localStorage.getItem('usermanager_admin_expiry');
    
    // Проверяем активность админской сессии
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
    
    // Получаем текущий режим с сервера
    try {
        const response = await fetch(`${CONFIG.API_URL}/mode`);
        if (response.ok) {
            const data = await response.json();
            currentServerMode = data.mode;
            console.log(`🌐 Серверный режим: ${currentServerMode}`);
        }
    } catch (error) {
        console.log('Не удалось получить режим с сервера:', error);
    }
    
    // Если нет активной админской сессии - форсируем серверный режим
    if (!isAdminActive) {
        localStorage.setItem('usermanager_use_real_api', 'true');
        CONFIG.USE_REAL_API = true;
        isAdmin = false;
        adminSessionId = null;
        console.log('🌐 Установлен серверный режим для гостя');
    } else {
        // Админ - загружаем его настройки
        const savedMode = localStorage.getItem('usermanager_use_real_api');
        if (savedMode !== null) {
            CONFIG.USE_REAL_API = savedMode === 'true';
        }
        console.log(`👑 Администратор: ${CONFIG.USE_REAL_API ? 'Серверный' : 'Локальный'} режим`);
    }
}

// Вызываем инициализацию сразу
initializeSystem();

// Функция для изменения режима на сервере
async function changeServerMode(newMode) {
    try {
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

// Функция переключения режима работы (только для администратора)
async function toggleServerMode() {
    if (!checkAdminAccess()) {
        showAdminLoginModal();
        return;
    }
    
    try {
        const currentMode = localStorage.getItem('usermanager_use_real_api');
        const newMode = currentMode === 'true' ? 'false' : 'true';
        
        // Меняем режим на сервере
        if (newMode === 'false') {
            // Включаем локальный режим на сервере
            await changeServerMode('local');
            localStorage.setItem('usermanager_use_real_api', 'false');
            CONFIG.USE_REAL_API = false;
            currentServerMode = 'local';
            
            alert('✅ Локальный режим включен\nТеперь только вы можете видеть данные с этого устройства.\nДругие устройства увидят пустую страницу.');
        } else {
            // Включаем серверный режим на сервере
            await changeServerMode('server');
            localStorage.setItem('usermanager_use_real_api', 'true');
            CONFIG.USE_REAL_API = true;
            currentServerMode = 'server';
            
            alert('✅ Серверный режим включен\nТеперь все пользователи видят общие данные.');
        }
        
        // Обновляем кнопку и перезагружаем
        updateModeButton();
        setTimeout(() => location.reload(), 1000);
        
    } catch (error) {
        alert(`❌ Ошибка: ${error.message}\nПроверьте, запущен ли Go сервер.`);
    }
}

// Обновление кнопки режима
function updateModeButton() {
    const adminBtn = document.getElementById('adminModeToggle');
    if (!adminBtn) return;
    
    const savedAdmin = localStorage.getItem('usermanager_admin_session');
    const expiry = localStorage.getItem('usermanager_admin_expiry');
    const isAdminActive = savedAdmin && expiry && Date.now() < parseInt(expiry);
    
    if (isAdminActive) {
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
    } else {
        adminBtn.style.display = 'none';
    }
}

// Окно входа для администратора (остается без изменений)
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
                <!-- Декоративные элементы -->
                <div style="
                    position: absolute;
                    top: -100px;
                    right: -100px;
                    width: 300px;
                    height: 300px;
                    background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
                    border-radius: 50%;
                "></div>

                <div style="
                    position: absolute;
                    bottom: -80px;
                    left: -80px;
                    width: 200px;
                    height: 200px;
                    background: radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%);
                    border-radius: 50%;
                "></div>

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
                        Только администратор может управлять системой. 
                        Введите пароль для доступа к управлению режимами работы.
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
                               "
                               onfocus="this.style.borderColor='#60a5fa'; this.style.boxShadow='0 0 0 4px rgba(96, 165, 250, 0.2)';"
                               onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';">
                        <div style="
                            position: absolute;
                            bottom: -25px;
                            left: 0;
                            right: 0;
                            text-align: center;
                            font-size: 0.85rem;
                            color: #94a3b8;
                        ">
                            Только администратор знает пароль
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem; margin-top: 3rem;">
                        <button onclick="universalGuestContinue()" style="
                            flex: 1;
                            padding: 1.25rem;
                            background: rgba(255, 255, 255, 0.05);
                            border: 2px solid rgba(255, 255, 255, 0.1);
                            color: #cbd5e1;
                            border-radius: 14px;
                            cursor: pointer;
                            font-weight: 600;
                            font-size: 1rem;
                            transition: all 0.3s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 0.75rem;
                        "
                        onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.transform='translateY(-2px)';"
                        onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'; this.style.transform='translateY(0)';">
                            <span>👤</span>
                            <span>Продолжить как гость</span>
                        </button>

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
                        "
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 15px 40px rgba(59, 130, 246, 0.5)';"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 12px 35px rgba(59, 130, 246, 0.35)';">
                            <span>🔓</span>
                            <span>Войти как администратор</span>
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
                        ❌ Неверный пароль администратора
                    </div>

                    <div style="
                        margin-top: 3rem;
                        padding-top: 2rem;
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                    ">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; text-align: left;">
                            <div>
                                <div style="color: #60a5fa; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                                    <span>🌐</span>
                                    <span>Серверный режим</span>
                                </div>
                                <div style="color: #94a3b8; font-size: 0.9rem;">
                                    • Доступен всем<br>
                                    • Работает с Go API<br>
                                    • Общие данные для всех
                                </div>
                            </div>

                            <div>
                                <div style="color: #a78bfa; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                                    <span>🔒</span>
                                    <span>Локальный режим</span>
                                </div>
                                <div style="color: #94a3b8; font-size: 0.9rem;">
                                    • Только для администратора<br>
                                    • Сервер блокирует доступ другим<br>
                                    • Видите данные только вы
                                </div>
                            </div>
                        </div>
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
                "
                onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.color='white';"
                onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'; this.style.color='#94a3b8';">
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
    if (modal) {
        modal.remove();
    }
}

function universalGuestContinue() {
    // Устанавливаем серверный режим для гостя
    localStorage.setItem('usermanager_use_real_api', 'true');
    CONFIG.USE_REAL_API = true;
    universalCloseModal();
    
    // Обновляем страницу
    alert('Включен серверный режим. Все пользователи видят общие данные.');
    setTimeout(() => location.reload(), 500);
}

function universalAdminLogin() {
    const passwordInput = document.getElementById('universalPasswordInput');
    const errorDiv = document.getElementById('universalError');
    
    if (!passwordInput) return;
    
    if (passwordInput.value === ADMIN_PASSWORD) {
        // Создаем сессию администратора
        createAdminSession();
        
        // По умолчанию устанавливаем серверный режим для админа
        localStorage.setItem('usermanager_use_real_api', 'true');
        CONFIG.USE_REAL_API = true;
        
        errorDiv.style.display = 'none';
        universalCloseModal();
        
        // Обновляем страницу
        alert('✅ Успешный вход как администратор!\nТеперь вы можете переключать режимы работы системы.');
        setTimeout(() => location.reload(), 500);
    } else {
        errorDiv.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// ================== ОСНОВНАЯ ЛОГИКА ПРИЛОЖЕНИЯ ==================

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