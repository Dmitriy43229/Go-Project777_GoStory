// ============================================
// UserManager Pro - Адаптивный клиент
// Работает с Go API или локально
// ============================================

// Принудительное обновление кеша при загрузке
(function () {
    // Проверяем версию в localStorage
    const CURRENT_VERSION = '2.0.7';
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
    window.fetch = function (url, options = {}) {
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
    VERSION: '2.0.7',
    LAST_UPDATE: new Date().toISOString()
};

// ================== СИСТЕМА ДО АДМИНИСТРАТОРА ==================
const ADMIN_PASSWORD = "admin123"; // Только вы знаете этот пароль
const ADMIN_TOKEN = "admin_local_token_123"; // Токен для локального режима
let isAdmin = false;
let adminSessionId = null;
let currentServerMode = "server"; // Храним текущий режим сервера

// Переменные для управления блокировкой
let isBlocked = false;
let blockCheckerInterval = null;
const BLOCK_CHECK_INTERVAL = 3000; // Проверять каждые 3 секунды

// Функция получения режима с сервера
async function getServerMode() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/mode?_=${Date.now()}`);
        if (response.ok) {
            const data = await response.json();
            return data.mode;
        }
    } catch (error) {
        console.log('Не удалось получить режим сервера:', error);
    }
    return "server";
}

// Функция проверки статуса с сервера
async function getServerStatus() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/status?_=${Date.now()}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.log('Не удалось получить статус сервера:', error);
    }
    return { mode: 'server', is_admin: false };
}

// Функция проверки блокировки - ПРОСТАЯ И ПРАВИЛЬНАЯ
async function checkBlockStatus() {
    try {
        const status = await getServerStatus();
        console.log('📡 Статус сервера:', status);
        
        // Сохраняем текущий режим сервера
        currentServerMode = status.mode;
        
        // Если режим серверный - НИКОГДА не блокируем
        if (status.mode === 'server') {
            console.log('🌐 Серверный режим - доступ открыт для всех');
            if (isBlocked) {
                // Если был заблокирован, но теперь серверный режим - разблокируем
                console.log('✅ Разблокировка: включен серверный режим');
                isBlocked = false;
                location.reload(true);
            }
            return false;
        }
        
        // Если режим локальный
        if (status.mode === 'local') {
            console.log('🔒 Локальный режим, проверяем доступ...');
            
            // Проверяем, админ ли мы
            const adminAccess = checkAdminAccess();
            console.log('👤 Админский доступ:', adminAccess, 'Статус сервера:', status.is_admin);
            
            // Если мы админ - разрешаем доступ
            if (adminAccess || status.is_admin) {
                console.log('👑 Администратор - доступ разрешен');
                if (isBlocked) {
                    isBlocked = false;
                    location.reload(true);
                }
                return false;
            }
            
            // Если не админ - блокируем
            console.log('🚫 Не админ в локальном режиме - блокировка');
            showBlockPage();
            return true;
        }
        
    } catch (error) {
        console.log('⚠️ Ошибка проверки статуса:', error);
        // При ошибке соединения - не блокируем
        return false;
    }
    return false;
}

// Функция показа страницы блокировки
function showBlockPage() {
    // Если уже показана блокировка, не делаем ничего
    if (document.body.classList.contains('blocked')) return;
    
    isBlocked = true;
    document.body.classList.add('blocked');
    document.body.innerHTML = '';
    document.body.style.cssText = `
        font-family: Arial, sans-serif;
        background-color: white;
        color: #333;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        text-align: center;
    `;

    const currentTime = new Date().toLocaleTimeString();
    const html = `
        <div style="padding: 3rem; max-width: 600px;">
            <h1 style="font-size: 4rem; color: #dc2626; margin-bottom: 1rem;">404</h1>
            <h2 style="font-size: 2rem; margin-bottom: 1.5rem; color: #4b5563;">
                Страница временно недоступна
            </h2>
            <p style="font-size: 1.2rem; color: #6b7280; margin-bottom: 2rem; line-height: 1.6;">
                <strong>UserManager Pro находится в локальном режиме.</strong><br>
                В данный момент администратор работает с системой локально.
            </p>
            <p style="font-size: 1.1rem; color: #6b7280; margin-bottom: 2rem;">
                Пожалуйста, попробуйте зайти позже, когда система вернется в серверный режим.
            </p>
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; 
                        padding: 1rem; margin-top: 2rem; color: #92400e;">
                <strong>Примечание для администратора:</strong><br>
                Для возврата в серверный режим нажмите кнопку "Режим: Локальный" на главной странице.
            </div>
            <button onclick="location.reload(true)" style="
                margin-top: 2rem;
                padding: 0.75rem 1.5rem;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                transition: background 0.3s;
            ">
                🔄 Обновить страницу
            </button>
            <div style="font-size: 1rem; color: #9ca3af; margin-top: 2rem; 
                       padding-top: 1.5rem; border-top: 1px solid #e5e7eb;">
                UserManager Pro • Локальный режим активен • Время: ${currentTime}
            </div>
        </div>
        <script>
            // Автоматическая проверка каждые 3 секунды
            setInterval(() => {
                fetch('${CONFIG.API_URL}/status?_=' + Date.now())
                    .then(response => response.json())
                    .then(data => {
                        console.log('Проверка статуса:', data);
                        if (data.mode === 'server' || data.is_admin) {
                            console.log('✅ Разблокировка доступна, перезагружаем...');
                            location.reload(true);
                        }
                    })
                    .catch(error => {
                        console.log('Ошибка проверки:', error);
                    });
            }, 3000);
        </script>
    `;

    document.body.innerHTML = html;
}

// Функция инициализации с немедленной проверкой
async function initializeSystem() {
    console.log('🚀 Инициализация системы...');
    
    // Сначала проверяем админский доступ
    const adminAccess = checkAdminAccess();
    console.log('👤 Проверка админского доступа:', adminAccess);
    
    // Проверяем блокировку
    const blocked = await checkBlockStatus();
    if (blocked) {
        console.log('🚫 Система заблокирована');
        return;
    }
    
    // Получаем текущий режим сервера
    try {
        const serverMode = await getServerMode();
        currentServerMode = serverMode;
        console.log('📡 Режим сервера:', serverMode);
        
        // Устанавливаем локальные настройки в соответствии с режимом сервера
        if (serverMode === 'local') {
            if (!adminAccess) {
                // Если не админ в локальном режиме - показываем блокировку
                console.log('🚫 Локальный режим, не админ - блокировка');
                showBlockPage();
                return;
            } else {
                // Админ в локальном режиме
                CONFIG.USE_REAL_API = false;
                localStorage.setItem('usermanager_use_real_api', 'false');
                console.log('👑 Админ в локальном режиме');
            }
        } else {
            // Серверный режим - всегда используем API
            CONFIG.USE_REAL_API = true;
            localStorage.setItem('usermanager_use_real_api', 'true');
            console.log('🌐 Серверный режим');
        }
    } catch (error) {
        console.log('⚠️ Ошибка получения режима сервера:', error);
        // По умолчанию - серверный режим
        CONFIG.USE_REAL_API = true;
        localStorage.setItem('usermanager_use_real_api', 'true');
        currentServerMode = "server";
    }
    
    // Обновляем интерфейс
    updateInterface();
    
    // Запускаем периодическую проверку
    startBlockChecker();
    
    // Загружаем данные
    if (!isBlocked) {
        setTimeout(() => {
            loadInitialData();
        }, 500);
    }
}

// Обновление интерфейса
function updateInterface() {
    console.log('🎨 Обновление интерфейса, isAdmin:', isAdmin);
    
    // Добавляем кнопку очистки кеша
    addCacheClearButton();
    
    // Обновляем кнопки админа
    updateAdminButtons();
    
    // Обновляем кнопку режима
    updateModeButton();
    
    // Обновляем отображение режима
    updateModeDisplay();
}

// Обновление отображения режима
function updateModeDisplay() {
    const modeTextEl = document.getElementById('currentModeText');
    const statusEl = document.getElementById('statusValue');
    
    if (modeTextEl) {
        if (currentServerMode === 'local' && !isAdmin) {
            modeTextEl.textContent = 'Режим: Локальный (доступ закрыт)';
            modeTextEl.style.color = '#ef4444';
        } else {
            modeTextEl.textContent = currentServerMode === 'local' ? 'Режим: Локальный' : 'Режим: Серверный';
            modeTextEl.style.color = currentServerMode === 'local' ? '#f59e0b' : '#4ade80';
        }
    }
    
    if (statusEl) {
        if (currentServerMode === 'local' && !isAdmin) {
            statusEl.textContent = 'Заблокирован';
            statusEl.style.color = '#ef4444';
        } else {
            statusEl.textContent = currentServerMode === 'server' ? 'Онлайн' : 'Локально';
            statusEl.style.color = currentServerMode === 'server' ? '#4ade80' : '#f59e0b';
        }
    }
}

// Обновление кнопок админа
function updateAdminButtons() {
    const adminBtn = document.getElementById('adminModeToggle');
    const logoutBtn = document.getElementById('logoutBtn');
    
    console.log('🔄 Обновление кнопок админа, isAdmin:', isAdmin);
    
    if (isAdmin) {
        console.log('👑 Отображаем кнопки админа');
        
        // Показываем кнопку переключения режима
        if (adminBtn) {
            adminBtn.style.display = 'flex';
            adminBtn.innerHTML = `
                <i class="fas fa-cogs"></i>
                <span>Режим: ${currentServerMode === 'local' ? 'Локальный' : 'Серверный'}</span>
            `;
        }
        
        // Добавляем кнопку выхода если её нет
        if (!logoutBtn) {
            addLogoutButton();
        } else if (logoutBtn) {
            logoutBtn.style.display = 'flex';
        }
    } else {
        console.log('👤 Скрываем кнопки админа');
        
        // Скрываем кнопки
        if (adminBtn) adminBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

// Добавление кнопки выхода
function addLogoutButton() {
    const navMenu = document.querySelector('.nav-menu');
    if (!navMenu) return;
    
    // Проверяем, не существует ли уже кнопка
    if (document.getElementById('logoutBtn')) return;
    
    const logoutBtn = document.createElement('a');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.href = '#';
    logoutBtn.className = 'nav-item logout-btn';
    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i><span>Выйти</span>';
    logoutBtn.onclick = function(e) {
        e.preventDefault();
        logoutAdmin();
    };
    logoutBtn.style.display = isAdmin ? 'flex' : 'none';
    
    // Вставляем перед кнопкой очистки кеша
    const cacheBtn = document.getElementById('cacheClearBtn');
    if (cacheBtn) {
        navMenu.insertBefore(logoutBtn, cacheBtn);
    } else {
        // Или в конец навигации
        navMenu.appendChild(logoutBtn);
    }
}

// Функция выхода из админ-режима
function logoutAdmin() {
    if (confirm('Вы уверены, что хотите выйти из режима администратора?')) {
        // Очищаем сессию
        localStorage.removeItem('usermanager_admin_session');
        localStorage.removeItem('usermanager_admin_expiry');
        localStorage.setItem('usermanager_use_real_api', 'true'); // Возвращаем серверный режим
        
        // Обновляем состояние
        isAdmin = false;
        adminSessionId = null;
        CONFIG.USE_REAL_API = true;
        
        // Проверяем не заблокирован ли теперь доступ
        checkBlockStatus().then(() => {
            // Обновляем интерфейс
            updateInterface();
            
            alert('✅ Вы вышли из режима администратора.');
            
            // Если сейчас локальный режим, мы будем заблокированы
            if (currentServerMode === 'local') {
                // Покажем сообщение
                setTimeout(() => {
                    alert('⚠️ Включен локальный режим. Так как вы вышли из админ-режима, доступ к данным будет закрыт.');
                    location.reload(true);
                }, 1000);
            } else {
                setTimeout(() => location.reload(true), 500);
            }
        });
    }
}

// Запуск проверки блокировки
function startBlockChecker() {
    // Очищаем предыдущий интервал если есть
    if (blockCheckerInterval) {
        clearInterval(blockCheckerInterval);
    }
    
    // Проверяем каждые 3 секунды
    blockCheckerInterval = setInterval(async () => {
        await checkBlockStatus();
    }, BLOCK_CHECK_INTERVAL);
}

// Проверка администратора
function checkAdminAccess() {
    // Проверяем сохраненную сессию администратора
    const savedSession = localStorage.getItem('usermanager_admin_session');
    const sessionExpiry = localStorage.getItem('usermanager_admin_expiry');

    console.log('🔍 Проверка админской сессии:', {
        savedSession: !!savedSession,
        sessionExpiry: sessionExpiry,
        now: Date.now(),
        expiryTime: sessionExpiry ? parseInt(sessionExpiry) : null
    });

    // Если есть активная сессия и она не истекла
    if (savedSession && sessionExpiry) {
        const now = Date.now();
        const expiryTime = parseInt(sessionExpiry);
        
        if (now < expiryTime) {
            isAdmin = true;
            adminSessionId = savedSession;
            console.log('✅ Администратор: активная сессия восстановлена');
            return true;
        } else {
            // Сессия истекла
            localStorage.removeItem('usermanager_admin_session');
            localStorage.removeItem('usermanager_admin_expiry');
            console.log('⚠️ Администратор: сессия истекла');
            isAdmin = false;
            return false;
        }
    }

    isAdmin = false;
    adminSessionId = null;
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

            // ОБНОВЛЯЕМ ЛОКАЛЬНЫЕ НАСТРОЙКИ ПРИ УСПЕШНОМ ИЗМЕНЕНИИ
            if (newMode === 'local') {
                localStorage.setItem('usermanager_use_real_api', 'false');
                CONFIG.USE_REAL_API = false;
            } else {
                localStorage.setItem('usermanager_use_real_api', 'true');
                CONFIG.USE_REAL_API = true;
            }

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

// Функция переключения режима с обновлением для всех
async function toggleServerMode() {
    if (!isAdmin) {
        showAdminLoginModal();
        return;
    }

    try {
        const currentMode = currentServerMode;
        const newMode = currentMode === "server" ? "local" : "server";
        const modeName = newMode === "server" ? "Серверный" : "Локальный";

        console.log(`🔄 Переключение режима с ${currentMode} на ${newMode}`);

        // Меняем режим на сервере
        await changeServerMode(newMode);
        
        // Обновляем локальные настройки
        localStorage.setItem('usermanager_use_real_api', newMode === 'server' ? 'true' : 'false');
        CONFIG.USE_REAL_API = newMode === 'server';
        currentServerMode = newMode;
        
        // Показываем сообщение
        if (newMode === 'local') {
            alert(`✅ Локальный режим включен!\n\nВСЕ ОБЫЧНЫЕ ПОЛЬЗОВАТЕЛИ СЕЙЧАС ЖЕ УВИДЯТ БЕЛУЮ СТРАНИЦУ 404!\n\nТолько вы (администратор) можете работать с системой.`);
        } else {
            alert(`✅ Серверный режим включен!\n\nВсе пользователи теперь видят общие данные.`);
        }
        
        // Обновляем интерфейс
        updateInterface();
        
        // Перезагружаем страницу через 1 секунду
        setTimeout(() => {
            console.log('🔄 Перезагрузка после смены режима');
            location.reload(true);
        }, 1000);

    } catch (error) {
        console.error('Ошибка переключения режима:', error);
        alert(`❌ Ошибка: ${error.message}`);
    }
}

// Обновление кнопки режима
function updateModeButton() {
    const adminBtn = document.getElementById('adminModeToggle');
    if (!adminBtn) return;

    if (isAdmin) {
        adminBtn.style.display = 'flex';
        adminBtn.innerHTML = `
            <i class="fas fa-cogs"></i>
            <span>Режим: ${currentServerMode === 'local' ? 'Локальный' : 'Серверный'}</span>
        `;
    } else {
        adminBtn.style.display = 'none';
    }
}

// Функция для кнопки обновления кеша
function clearCache() {
    if (confirm('Очистить весь кеш браузера и перезагрузить страницу?')) {
        // Очищаем все данные
        localStorage.clear();
        sessionStorage.clear();
        
        // Очищаем кеш Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        }
        
        // Очищаем кеш браузера
        if ('caches' in window) {
            caches.keys().then(function(names) {
                for (let name of names) {
                    caches.delete(name);
                }
            });
        }
        
        alert('✅ Весь кеш очищен. Страница будет перезагружена.');
        
        // Принудительная перезагрузка с очисткой кеша
        setTimeout(() => {
            window.location.href = window.location.pathname + '?nocache=' + Date.now();
        }, 500);
    }
}

// Добавляем кнопку обновления кеша в навигацию
function addCacheClearButton() {
    // Ищем навигационное меню
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        // Проверяем, не добавлена ли уже кнопка
        if (!document.getElementById('cacheClearBtn')) {
            const cacheBtn = document.createElement('a');
            cacheBtn.id = 'cacheClearBtn';
            cacheBtn.href = '#';
            cacheBtn.className = 'nav-item';
            cacheBtn.innerHTML = '<i class="fas fa-sync-alt"></i><span>Очистить кеш</span>';
            cacheBtn.onclick = function(e) {
                e.preventDefault();
                clearCache();
            };
            
            // Находим кнопку "Вход администратора" и вставляем перед ней
            const adminLoginBtn = document.querySelector('.nav-item[onclick*="showAdminLoginModal"]');
            if (adminLoginBtn) {
                navMenu.insertBefore(cacheBtn, adminLoginBtn);
            } else {
                // Ищем последнюю кнопку в навигации
                const lastNavItem = navMenu.lastElementChild;
                if (lastNavItem) {
                    navMenu.insertBefore(cacheBtn, lastNavItem);
                } else {
                    navMenu.appendChild(cacheBtn);
                }
            }
        }
    }
}

// Окно входа для администратора (упрощенное)
function showAdminLoginModal() {
    const password = prompt('Введите пароль администратора:');
    
    if (password === null) {
        return; // Пользователь отменил ввод
    }
    
    if (password === ADMIN_PASSWORD) {
        // Создаем сессию администратора
        createAdminSession();
        
        // Если режим локальный, устанавливаем локальные настройки
        if (currentServerMode === 'local') {
            localStorage.setItem('usermanager_use_real_api', 'false');
            CONFIG.USE_REAL_API = false;
        } else {
            localStorage.setItem('usermanager_use_real_api', 'true');
            CONFIG.USE_REAL_API = true;
        }
        
        alert('✅ Успешный вход как администратор!\nТеперь вы можете переключать режимы работы системы.');
        
        // Обновляем интерфейс
        updateInterface();
        
        // Перезагружаем страницу
        setTimeout(() => location.reload(true), 500);
    } else if (password !== '') {
        alert('❌ Неверный пароль администратора');
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
    // Проверяем блокировку
    if (isBlocked) {
        return [];
    }

    if (CONFIG.USE_REAL_API) {
        try {
            const response = await fetch(`${CONFIG.API_URL}/users?_=${Date.now()}`);
            if (response.ok) {
                const users = await response.json();
                return users;
            } else {
                throw new Error('Сервер недоступен');
            }
        } catch (error) {
            console.warn('Не удалось получить данные с сервера:', error);
            // Используем локальные данные в случае ошибки
            if (isAdmin) {
                return localUsers;
            }
            return [];
        }
    } else {
        // Локальный режим - только для админа
        if (isAdmin) {
            return localUsers;
        } else {
            return [];
        }
    }
}

// Получение статистики
async function getStats() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/stats?_=${Date.now()}`);
        if (response.ok) {
            const stats = await response.json();
            return stats;
        } else {
            throw new Error('Сервер недоступен');
        }
    } catch (error) {
        console.warn('Не удалось получить статистику с сервера:', error);

        // Возвращаем локальную статистику
        return {
            total_users: localUsers.length,
            server_time: new Date().toISOString(),
            status: 'offline',
            version: '1.0.0',
            mode: currentServerMode
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
                <div style="text-align: center; padding: 3rem; color: #94a3b8; grid-column: 1 / -1;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                    <h3 style="color: #64748b; margin-bottom: 1rem;">Локальный режим активен</h3>
                    <p>В данный момент администратор работает в локальном режиме.</p>
                    <p>Данные временно недоступны для просмотра.</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #94a3b8; grid-column: 1 / -1;">
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
            <div style="width: 50px; height: 50px; background: linear-gradient(45deg, #3b82f6, #1d4ed8); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.2rem;">
                ${user.name.charAt(0)}
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; color: white; margin-bottom: 0.25rem;">${user.name}</div>
                <div style="color: #bbdefb; font-size: 0.9rem; margin-bottom: 0.5rem;">${user.email}</div>
                <div style="color: #94a3b8; font-size: 0.8rem;">Зарегистрирован: ${formattedDate}</div>
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
    const usersValueEl = document.getElementById('usersValue');

    if (totalUsersEl) totalUsersEl.textContent = stats.total_users || 0;
    if (activeUsersEl) activeUsersEl.textContent = stats.total_users || 0;
    if (usersValueEl) usersValueEl.textContent = stats.total_users || 0;
}

// Загрузка данных при старте
async function loadInitialData() {
    try {
        // Сначала проверяем блокировку
        if (isBlocked) {
            console.log('🚫 Загрузка данных пропущена: система заблокирована');
            return; // Если заблокирован, не загружаем данные
        }

        console.log('📥 Начало загрузки данных...');
        
        // Инициализируем локальные данные
        initLocalData();

        // Получаем статистику
        const stats = await getStats();
        updateStatsDisplay(stats);

        // Получаем и отображаем пользователей
        const users = await getAllUsers();
        displayUsers(users);
        
        console.log('✅ Данные успешно загружены');

    } catch (error) {
        console.error('❌ Ошибка загрузки данных:', error);
    }
}

// Вызываем инициализацию сразу при загрузке
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен, инициализируем систему...');
    initializeSystem();
});