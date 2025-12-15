// ============================================
// UserManager Pro - Адаптивный клиент
// Работает с Go API или локально
// ============================================

const CONFIG = {
    USE_REAL_API: false, // true - использовать Go API, false - локальные данные
    API_URL: 'https://ваш-go-api.на-хостинге.com/api',
    STORAGE_KEY: 'usermanager_local_data'
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
    if (CONFIG.USE_REAL_API) {
        return realApiRequest(url, options);
    } else {
        return mockApiRequest(url, options);
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
    return await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify(userData)
    });
}

async function updateUser(id, userData) {
    return await apiRequest(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(userData)
    });
}

async function deleteUser(id) {
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

// ================== ГРАФИКИ ==================
function getUsersForCharts() {
    return [...localUsers];
}

// ================== ИНИЦИАЛИЗАЦИЯ ==================
document.addEventListener('DOMContentLoaded', function () {
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
});

// ================== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==================
window.openModal = openModal;
window.closeModal = closeModal;
window.editUser = editUser;
window.deleteUserConfirm = deleteUserConfirm;
window.searchUsers = searchUsers;
window.loadUsers = loadUsers;
window.loadDemoData = loadDemoData;

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
`;
document.head.appendChild(style);