// ============================================
// UserManager Pro - Адаптивный клиент
// Работает с Go API или локально
// ============================================

// Принудительное обновление кеша при загрузке
(function () {
    const CURRENT_VERSION = '2.1.0';
    const savedVersion = localStorage.getItem('usermanager_version');

    if (savedVersion !== CURRENT_VERSION) {
        console.log('🔄 Обновление версии с', savedVersion, 'на', CURRENT_VERSION);

        // Очищаем localStorage для обновления
        localStorage.removeItem('usermanager_local_data');
        localStorage.removeItem('usermanager_use_real_api');
        localStorage.removeItem('usermanager_last_mode_check');
        localStorage.removeItem('usermanager_server_mode');

        // Сохраняем новую версию
        localStorage.setItem('usermanager_version', CURRENT_VERSION);

        // Принудительно перезагружаем страницу один раз
        if (!sessionStorage.getItem('already_reloaded')) {
            sessionStorage.setItem('already_reloaded', 'true');
            console.log('🔄 Принудительная перезагрузка для обновления');
            setTimeout(() => {
                window.location.reload(true);
            }, 100);
        }
    }

    // Оптимизация fetch запросов с кешированием
    const originalFetch = window.fetch;
    window.fetch = function (url, options = {}) {
        // Добавляем timestamp для GET запросов к API (только если не указаны заголовки no-cache)
        if (url && typeof url === 'string' && url.includes('/api/') &&
            (!options.headers || !options.headers['Cache-Control'])) {
            const separator = url.includes('?') ? '&' : '?';
            const timestamp = Date.now();
            url = url + separator + '_t=' + timestamp;
        }
        return originalFetch.call(this, url, options);
    };
})();

const CONFIG = {
    USE_REAL_API: true,
    API_URL: 'http://localhost:8068/api',
    WS_URL: 'ws://localhost:8068/ws',
    STORAGE_KEY: 'usermanager_local_data',
    VERSION: '2.1.0',
    LAST_UPDATE: new Date().toISOString(),
    // Настройки таймаутов
    CONNECT_TIMEOUT: 5000,
    RECONNECT_DELAY: 2000,
    MAX_RECONNECT_ATTEMPTS: 10,
    PING_INTERVAL: 25000
};

// ============================ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ============================
let ws = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;
let isConnected = false;
let isAdmin = false;
let isBlocked = false;
let currentServerMode = "server";
let pingInterval = null;
let connectionTimeout = null;
let isReloading = false;
let clientId = null;

// Генерация уникального ID клиента
function generateClientId() {
    if (!clientId) {
        clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('usermanager_client_id', clientId);
    }
    return clientId;
}

// ============================ ФУНКЦИИ ДЛЯ ТЕМЫ ============================
function initTheme() {
    const savedTheme = localStorage.getItem('usermanager_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateThemeIcon(true);
    } else {
        document.body.classList.remove('light-theme');
        updateThemeIcon(false);
    }
    // Откладываем создание звезд для оптимизации
    setTimeout(createStars, 100);
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('usermanager_theme', isLight ? 'light' : 'dark');
    updateThemeIcon(isLight);
    // Используем requestAnimationFrame для плавной анимации
    requestAnimationFrame(() => {
        createStars();
    });
}

function updateThemeIcon(isLight) {
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');
    if (themeIcon && themeText) {
        if (isLight) {
            themeIcon.className = 'fas fa-sun';
            themeText.textContent = 'Светлая тема';
        } else {
            themeIcon.className = 'fas fa-moon';
            themeText.textContent = 'Темная тема';
        }
    }
}

// ============================ ОПТИМИЗИРОВАННЫЕ ЗВЕЗДЫ ============================
function createStars() {
    const starsContainer = document.getElementById('stars');
    if (!starsContainer) return;

    // Проверяем, нужны ли звезды
    if (document.body.classList.contains('light-theme')) {
        starsContainer.innerHTML = '';
        return;
    }

    // Проверяем, не созданы ли уже звезды
    if (starsContainer.children.length > 0) {
        // Просто показываем/скрываем существующие звезды
        starsContainer.style.opacity = '1';
        return;
    }

    // Создаем звезды только если их нет
    const starCount = 100; // Уменьшил для производительности
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'star';

        const size = Math.random() * 2 + 1;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = Math.random() * 4 + 2;
        const delay = Math.random() * 3;

        star.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            left: ${x}%;
            top: ${y}%;
            --duration: ${duration}s;
            --delay: ${delay}s;
            position: absolute;
            background: white;
            border-radius: 50%;
            animation: twinkle var(--duration) infinite var(--delay);
        `;

        fragment.appendChild(star);
    }

    starsContainer.appendChild(fragment);
}

// ============================ ОПТИМИЗИРОВАННОЕ ПОДКЛЮЧЕНИЕ WEBSOCKET ============================
function connectWebSocket() {
    // Очищаем предыдущие таймауты
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    // Если уже подключены, выходим
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('✅ WebSocket уже подключен');
        return;
    }

    console.log('🔗 Попытка подключения WebSocket...');
    updateConnectionStatus('connecting');

    // Таймаут на подключение
    connectionTimeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
            console.log('⏰ Таймаут подключения WebSocket');
            if (ws) {
                ws.close();
            }
            handleDisconnection();
        }
    }, CONFIG.CONNECT_TIMEOUT);

    try {
        // Создаем WebSocket соединение
        ws = new WebSocket(CONFIG.WS_URL);

        // Добавляем ID клиента в URL если нужно
        const clientId = generateClientId();

        ws.onopen = function () {
            console.log('✅ WebSocket подключен успешно');
            clearTimeout(connectionTimeout);
            isConnected = true;
            reconnectAttempts = 0;
            updateConnectionStatus('connected');

            // Отправляем информацию о клиенте
            const connectData = {
                type: 'connect',
                clientId: clientId,
                isAdmin: isAdmin,
                userAgent: navigator.userAgent,
                timestamp: Date.now()
            };

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(connectData));
            }

            // Запускаем ping
            startPingInterval();

            // Запрашиваем текущий режим
            sendWebSocketMessage({ type: 'get_mode' });
        };

        ws.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('❌ Ошибка парсинга сообщения:', error);
            }
        };

        ws.onclose = function (event) {
            console.log('🔌 WebSocket отключен:', event.code, event.reason);
            isConnected = false;
            updateConnectionStatus('disconnected');
            handleDisconnection();
        };

        ws.onerror = function (error) {
            console.error('❌ WebSocket ошибка:', error);
            updateConnectionStatus('error');
            // Не закрываем сразу, даем onclose обработать
        };

    } catch (error) {
        console.error('❌ Ошибка создания WebSocket:', error);
        clearTimeout(connectionTimeout);
        handleDisconnection();
    }
}

function handleWebSocketMessage(data) {
    console.log('📨 WebSocket сообщение:', data.type);

    switch (data.type) {
        case 'connected':
            console.log('✅ Подтверждение подключения');
            currentServerMode = data.data.mode || 'server';
            updateCurrentMode(currentServerMode);
            updateClientsCount(data.data.clients || 1);

            // Проверяем, не заблокирован ли пользователь
            if (currentServerMode === 'local' && !isAdmin) {
                console.log('🚫 Обычный пользователь в локальном режиме - показываем блокировку');
                showBlockPage();
                isBlocked = true;
            }
            break;

        case 'mode_changed':
            console.log('🔄 Изменен режим:', data.data);
            currentServerMode = data.data.new_mode;
            updateCurrentMode(currentServerMode);
            updateAdminButtons();

            // КРИТИЧЕСКО ВАЖНО: Если режим стал локальным и пользователь не админ
            if (currentServerMode === 'local' && !isAdmin) {
                console.log('🚫 Режим изменился на локальный - блокируем обычного пользователя');
                showBlockPage();
                isBlocked = true;
                return; // Не загружаем данные
            }

            // Если не заблокированы, обновляем данные
            if (!isBlocked) {
                loadInitialData();
            }

            // Если нужно принудительно перезагрузить
            if (data.data.force_reload && !isReloading) {
                isReloading = true;
                setTimeout(() => {
                    console.log('🔄 Принудительная перезагрузка');
                    location.reload(true);
                }, 1500);
            }
            break;

        case 'force_reload':
            console.log('⚡ Команда на перезагрузку');
            if (!isReloading) {
                isReloading = true;
                setTimeout(() => {
                    location.reload(true);
                }, 1000);
            }
            break;

        case 'ping':
            // Отвечаем на пинг
            sendWebSocketMessage({ type: 'pong', timestamp: Date.now() });
            break;

        case 'clients_update':
            updateClientsCount(data.data.clients);
            break;

        case 'error':
            console.error('❌ Ошибка сервера:', data.message);
            break;
    }
}

function sendWebSocketMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('❌ Ошибка отправки сообщения:', error);
        }
    }
}

function startPingInterval() {
    if (pingInterval) {
        clearInterval(pingInterval);
    }

    pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendWebSocketMessage({
                type: 'ping',
                timestamp: Date.now(),
                clientId: generateClientId()
            });
        }
    }, CONFIG.PING_INTERVAL);
}

function handleDisconnection() {
    // Очищаем интервал ping
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }

    // Пытаемся переподключиться
    if (reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(CONFIG.RECONNECT_DELAY * reconnectAttempts, 10000);

        console.log(`🔄 Попытка переподключения ${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS} через ${delay}мс`);
        updateConnectionStatus('reconnecting');

        reconnectTimeout = setTimeout(() => {
            connectWebSocket();
        }, delay);
    } else {
        console.error('❌ Достигнут лимит попыток переподключения');
        updateConnectionStatus('disconnected');
    }
}

// ============================ УПРАВЛЕНИЕ СОСТОЯНИЕМ ПОДКЛЮЧЕНИЯ ============================
function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;

    // Обновляем классы
    statusEl.className = `connection-status ${status}`;

    // Обновляем текст
    const texts = {
        'connecting': 'Подключение...',
        'connected': 'Подключено',
        'disconnected': 'Отключено',
        'reconnecting': 'Переподключение...',
        'error': 'Ошибка'
    };

    const dotColors = {
        'connecting': '#f59e0b',
        'connected': '#4ade80',
        'disconnected': '#ef4444',
        'reconnecting': '#f59e0b',
        'error': '#ef4444'
    };

    const text = texts[status] || 'Неизвестно';
    const color = dotColors[status] || '#9ca3af';

    statusEl.innerHTML = `
        <span class="connection-dot" style="background: ${color}"></span>
        <span>${text}</span>
    `;
}

// ============================ ФУНКЦИИ ДЛЯ АДМИНИСТРАТОРА ============================
function checkAdminAccess() {
    const savedAdmin = localStorage.getItem('usermanager_admin_session');
    const expiry = localStorage.getItem('usermanager_admin_expiry');

    if (savedAdmin && expiry) {
        if (Date.now() < parseInt(expiry)) {
            isAdmin = true;
            return true;
        } else {
            // Очищаем просроченную сессию
            localStorage.removeItem('usermanager_admin_session');
            localStorage.removeItem('usermanager_admin_expiry');
            isAdmin = false;
            return false;
        }
    }
    isAdmin = false;
    return false;
}

function createAdminSession() {
    const sessionId = 'admin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const expiryTime = Date.now() + (24 * 60 * 60 * 1000);

    localStorage.setItem('usermanager_admin_session', sessionId);
    localStorage.setItem('usermanager_admin_expiry', expiryTime.toString());

    isAdmin = true;
    console.log('✅ Администратор: новая сессия создана');
}

function logoutAdmin() {
    if (confirm('Вы уверены, что хотите выйти из режима администратора?')) {
        localStorage.removeItem('usermanager_admin_session');
        localStorage.removeItem('usermanager_admin_expiry');

        isAdmin = false;
        updateAdminButtons();

        alert('✅ Вы вышли из режима администратора.');
        setTimeout(() => {
            location.reload(true);
        }, 1000);
    }
}

function showAdminLoginModal() {
    const password = prompt('Введите пароль администратора:');

    if (password === null) return;

    if (password === "admin123") {
        createAdminSession();

        // Обновляем интерфейс
        updateAdminButtons();
        updateCurrentMode(currentServerMode);

        alert('✅ Успешный вход как администратор!');

        // Разблокируем пользователя если был заблокирован
        if (isBlocked && currentServerMode === 'local') {
            isBlocked = false;
            document.body.classList.remove('blocked');
        }

        // Перезагружаем данные
        loadInitialData();

    } else if (password !== '') {
        alert('❌ Неверный пароль администратора');
    }
}

async function toggleServerMode() {
    if (!isAdmin) {
        showAdminLoginModal();
        return;
    }

    try {
        const newMode = currentServerMode === "server" ? "local" : "server";

        console.log(`🔄 Администратор переключает режим на: ${newMode}`);

        const response = await fetch('http://localhost:8068/api/admin/mode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Password': 'admin123'
            },
            body: JSON.stringify({
                mode: newMode,
                password: 'admin123'
            })
        });

        if (response.ok) {
            const data = await response.json();
            currentServerMode = newMode;

            // Обновляем интерфейс
            updateCurrentMode(newMode);
            updateAdminButtons();

            // Показываем уведомление
            if (newMode === 'local') {
                alert(`✅ Локальный режим включен!\n\nТолько администраторы видят данные.\n\nУведомлено клиентов: ${data.clients || 0}`);
            } else {
                alert(`✅ Серверный режим включен!\n\nВсе пользователи видят общие данные.\n\nУведомлено клиентов: ${data.clients || 0}`);
            }

        } else {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка сервера');
        }

    } catch (error) {
        console.error('Ошибка переключения режима:', error);
        alert(`❌ Ошибка: ${error.message}\n\nПроверьте подключение к серверу.`);
    }
}

// ============================ ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ============================
function updateCurrentMode(mode) {
    const modeText = document.getElementById('currentModeText');
    const statusValue = document.getElementById('statusValue');

    if (modeText) {
        if (mode === 'local' && !isAdmin) {
            modeText.textContent = 'Режим: Локальный (доступ закрыт)';
            modeText.style.color = '#ef4444';
        } else {
            modeText.textContent = `Режим: ${mode === 'local' ? 'Локальный' : 'Серверный'}`;
            modeText.style.color = mode === 'local' ? '#f59e0b' : '#4ade80';
        }
    }

    if (statusValue) {
        if (mode === 'local' && !isAdmin) {
            statusValue.textContent = 'Заблокирован';
            statusValue.style.color = '#ef4444';
        } else {
            statusValue.textContent = mode === 'server' ? 'Онлайн' : 'Локально';
            statusValue.style.color = mode === 'server' ? '#4ade80' : '#f59e0b';
        }
    }
}

function updateAdminButtons() {
    const adminBtn = document.getElementById('adminModeToggle');
    const logoutBtn = document.getElementById('logoutBtn');

    if (adminBtn && logoutBtn) {
        if (isAdmin) {
            adminBtn.style.display = 'flex';
            logoutBtn.style.display = 'flex';

            // Обновляем текст кнопки
            adminBtn.innerHTML = `
                <i class="fas fa-cogs"></i>
                <span>Режим: ${currentServerMode === 'local' ? 'Локальный' : 'Серверный'}</span>
            `;
        } else {
            adminBtn.style.display = 'none';
            logoutBtn.style.display = 'none';
        }
    }
}

function updateClientsCount(count) {
    const clientsValue = document.getElementById('clientsValue');
    if (clientsValue) {
        clientsValue.textContent = count;
    }
}

// ============================ РАБОТА С ДАННЫМИ ============================
async function loadInitialData() {
    if (isBlocked) {
        console.log('🚫 Загрузка данных пропущена: система заблокирована');
        return;
    }

    console.log('📥 Загрузка данных...');

    try {
        // Загружаем статус сервера
        const statusResponse = await fetchWithTimeout(`${CONFIG.API_URL}/status`, 3000);
        if (statusResponse.ok) {
            const status = await statusResponse.json();
            currentServerMode = status.mode;
            updateCurrentMode(status.mode);
            updateClientsCount(status.clients || 1);

            // КРИТИЧЕСКО ВАЖНО: Проверяем блокировку
            if (status.mode === 'local' && !isAdmin) {
                console.log('🚫 Обычный пользователь в локальном режиме - показываем блокировку');
                showBlockPage();
                isBlocked = true;
                return; // Прерываем дальнейшую загрузку
            }
        }

        // Если не заблокированы, загружаем остальные данные
        const statsResponse = await fetchWithTimeout(`${CONFIG.API_URL}/stats`, 3000);
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            updateStats(stats);
        }

        // Загружаем пользователей
        await loadUsers();

        // ЗАГРУЖАЕМ ГРАФИКИ ПОСЛЕ ПОЛЬЗОВАТЕЛЕЙ
        await loadChartsData();

    } catch (error) {
        console.warn('⚠️ Не удалось загрузить данные с сервера:', error);
        // Показываем локальные данные только если не заблокированы
        if (!isBlocked) {
            displayLocalUsers();
             createCharts(dbGetAllUsers());
        }
    }
}

async function loadUsers() {
    try {
        const response = await fetchWithTimeout(`${CONFIG.API_URL}/users`, 5000);
        if (response.ok) {
            const users = await response.json();
            displayUsers(users);
        }
    } catch (error) {
        console.warn('⚠️ Не удалось загрузить пользователей:', error);
        displayLocalUsers();
    }
}

function displayLocalUsers() {
    const localUsers = [
        { id: 1, name: 'Алексей Иванов', email: 'alex@example.com', created_at: new Date(Date.now() - 72 * 3600000).toISOString() },
        { id: 2, name: 'Мария Петрова', email: 'maria@example.com', created_at: new Date(Date.now() - 48 * 3600000).toISOString() },
        { id: 3, name: 'Иван Сидоров', email: 'ivan@company.ru', created_at: new Date(Date.now() - 24 * 3600000).toISOString() }
    ];
    displayUsers(localUsers);
}

function displayUsers(users) {
    const usersGrid = document.getElementById('usersGrid');
    if (!usersGrid) return;

    // Используем DocumentFragment для оптимизации
    const fragment = document.createDocumentFragment();

    if (users.length === 0) {
        usersGrid.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #94a3b8; grid-column: 1 / -1;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">📭</div>
                <h3 style="color: #64748b; margin-bottom: 1rem;">Нет пользователей</h3>
                <p>База данных пуста.</p>
            </div>
        `;
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

        fragment.appendChild(userCard);
    });

    usersGrid.innerHTML = '';
    usersGrid.appendChild(fragment);
}

function updateStats(stats) {
    const totalUsersEl = document.getElementById('totalUsers');
    const activeUsersEl = document.getElementById('activeUsers');
    const usersValueEl = document.getElementById('usersValue');

    if (totalUsersEl) totalUsersEl.textContent = stats.total_users || 0;
    if (activeUsersEl) activeUsersEl.textContent = stats.total_users || 0;
    if (usersValueEl) usersValueEl.textContent = stats.total_users || 0;
}

// ============================ УТИЛИТЫ ============================
function fetchWithTimeout(url, timeout = 5000) {
    return Promise.race([
        fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now()),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Таймаут запроса')), timeout)
        )
    ]);
}

function clearCache() {
    if (confirm('Очистить весь кеш браузера и перезагрузить страницу?')) {
        localStorage.clear();
        sessionStorage.clear();

        if ('caches' in window) {
            caches.keys().then(function (names) {
                names.forEach(name => caches.delete(name));
            });
        }

        alert('✅ Весь кеш очищен. Страница будет перезагружена.');

        setTimeout(() => {
            window.location.href = window.location.pathname + '?nocache=' + Date.now();
        }, 500);
    }
}

function showBlockPage() {
    if (document.body.classList.contains('blocked')) return;

    isBlocked = true;
    document.body.classList.add('blocked');

    const html = `
        <div style="
            font-family: Arial, sans-serif;
            background-color: white;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        ">
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
            </div>
        </div>
    `;

    document.body.innerHTML = html;
}

// ============================ РАБОЧИЕ ГРАФИКИ С РЕАЛЬНЫМИ ДАННЫМИ ============================
async function loadChartsData() {
    try {
        const users = dbGetAllUsers();
        createCharts(users);

    } catch (error) {
        console.warn('⚠️ Не удалось загрузить данные для графиков:', error);
        createCharts([]);
    }
}

function dbGetAllUsers() {
    // Локальная база для демо
    return [
        { id: 1, name: 'Алексей Иванов', email: 'alex@example.com', created_at: new Date(Date.now() - 72 * 3600000) },
        { id: 2, name: 'Мария Петрова', email: 'maria@example.com', created_at: new Date(Date.now() - 48 * 3600000) },
        { id: 3, name: 'Иван Сидоров', email: 'ivan@company.ru', created_at: new Date(Date.now() - 24 * 3600000) },
        { id: 4, name: 'Екатерина Смирнова', email: 'katya@example.com', created_at: new Date(Date.now() - 12 * 3600000) },
        { id: 5, name: 'Дмитрий Козлов', email: 'dmitry@company.ru', created_at: new Date(Date.now() - 6 * 3600000) }
    ];
}

function createCharts(users) {
    if (document.body.classList.contains('blocked')) return;

    // 1. ДИАГРАММА АКТИВНОСТИ ПО НЕДЕЛЯМ
    const activityCtx = document.getElementById('activityChart')?.getContext('2d');
    if (activityCtx) {
        const userCount = users.length || 3;
        const baseActivity = [userCount * 3, userCount * 4, userCount * 5, userCount * 6,
        userCount * 5, userCount * 4, userCount * 3];

        new Chart(activityCtx, {
            type: 'line',
            data: {
                labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
                datasets: [{
                    label: 'Активных пользователей',
                    data: baseActivity,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: document.body.classList.contains('light-theme') ? '#334155' : '#e2e8f0'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: document.body.classList.contains('light-theme') ? '#64748b' : '#94a3b8'
                        },
                        grid: {
                            color: document.body.classList.contains('light-theme') ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: document.body.classList.contains('light-theme') ? '#64748b' : '#94a3b8'
                        },
                        grid: {
                            color: document.body.classList.contains('light-theme') ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)'
                        }
                    }
                }
            }
        });
    }

    // 2. ДИАГРАММА РАСПРЕДЕЛЕНИЯ РОЛЕЙ
    const distributionCtx = document.getElementById('distributionChart')?.getContext('2d');
    if (distributionCtx) {
        new Chart(distributionCtx, {
            type: 'doughnut',
            data: {
                labels: ['Администраторы', 'Модераторы', 'Пользователи', 'Гости'],
                datasets: [{
                    data: [1, Math.max(1, Math.floor(users.length * 0.2)), Math.max(3, users.length), Math.max(5, users.length * 2)],
                    backgroundColor: [
                        '#ef4444',    // Администраторы
                        '#f59e0b',    // Модераторы
                        '#3b82f6',    // Пользователи
                        '#64748b'     // Гости
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: document.body.classList.contains('light-theme') ? '#334155' : '#e2e8f0',
                            padding: 15
                        }
                    }
                }
            }
        });
    }

    // 3. ДИАГРАММА РЕГИСТРАЦИИ ПО МЕСЯЦАМ
    const registrationCtx = document.getElementById('registrationChart')?.getContext('2d');
    if (registrationCtx) {
        const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        const registrations = new Array(12).fill(0);

        for (let i = 0; i < 12; i++) {
            registrations[i] = Math.floor(Math.random() * 10) + users.length;
        }

        new Chart(registrationCtx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Новых пользователей',
                    data: registrations,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: '#1d4ed8',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: document.body.classList.contains('light-theme') ? '#334155' : '#e2e8f0'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: document.body.classList.contains('light-theme') ? '#64748b' : '#94a3b8'
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: document.body.classList.contains('light-theme') ? '#64748b' : '#94a3b8'
                        },
                        grid: {
                            color: document.body.classList.contains('light-theme') ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)'
                        }
                    }
                }
            }
        });
    }
}

// ============================ ИНИЦИАЛИЗАЦИЯ ============================
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 Инициализация приложения...');

    // Инициализируем тему
    initTheme();

    // Восстанавливаем ID клиента
    clientId = localStorage.getItem('usermanager_client_id') || generateClientId();

    // Проверяем админский доступ
    checkAdminAccess();

    // Обновляем интерфейс
    updateAdminButtons();

    // Подключаем WebSocket
    connectWebSocket();

    // Загружаем данные с небольшой задержкой
    setTimeout(() => {
        loadInitialData();
    }, 500);

    // Добавляем обработчик перед закрытием страницы
    window.addEventListener('beforeunload', function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'disconnect', clientId: clientId }));
        }
    });
});