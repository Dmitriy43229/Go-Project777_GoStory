// API functions
const API_BASE = '/api/users';

async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        const data = response.status === 204 ? null : await response.json();

        if (!response.ok) {
            throw new Error(data?.error || `HTTP error! status: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API request failed:', error);
        showNotification(error.message || 'Ошибка при выполнении запроса', 'error');
        throw error;
    }
}

async function loadUsers() {
    showLoading(true);
    try {
        const users = await apiRequest(API_BASE);
        displayUsers(users);
    } catch (error) {
        console.error('Failed to load users:', error);
    } finally {
        showLoading(false);
    }
}

async function createUser(userData) {
    return await apiRequest(API_BASE, {
        method: 'POST',
        body: JSON.stringify(userData),
    });
}

async function updateUser(id, userData) {
    return await apiRequest(`${API_BASE}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(userData),
    });
}

async function deleteUser(id) {
    return await apiRequest(`${API_BASE}/${id}`, {
        method: 'DELETE',
    });
}

// UI functions
function displayUsers(users) {
    const grid = document.getElementById('usersGrid');

    if (!users || users.length === 0) {
        grid.innerHTML = `
            <div class="no-users">
                <div class="empty-state">
                    <i class="empty-icon">👤</i>
                    <h3>Пользователи не найдены</h3>
                    <p>Добавьте первого пользователя, нажав кнопку выше</p>
                </div>
            </div>
        `;
        return;
    }

    grid.innerHTML = users.map(user => `
        <div class="user-card animate-card" data-user-id="${user.id}">
            <div class="user-avatar">${getInitials(user.name)}</div>
            <div class="user-info">
                <div class="user-name">${escapeHtml(user.name)}</div>
                <div class="user-email">${escapeHtml(user.email)}</div>
                <div class="user-meta">
                    <span class="user-id">ID: ${user.id}</span>
                    <span class="user-date">${formatDate(user.created_at)}</span>
                </div>
            </div>
            <div class="user-actions">
                <button class="btn btn-edit" onclick="editUser(${user.id})" title="Редактировать">
                    <span class="btn-icon">✏️</span>
                </button>
                <button class="btn btn-danger" onclick="deleteUserConfirm(${user.id})" title="Удалить">
                    <span class="btn-icon">🗑️</span>
                </button>
            </div>
        </div>
    `).join('');
}

function getInitials(name) {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function openModal(user = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('userForm');

    if (user) {
        title.textContent = 'Редактировать пользователя';
        document.getElementById('userId').value = user.id;
        document.getElementById('userName').value = user.name;
        document.getElementById('userEmail').value = user.email;
    } else {
        title.textContent = 'Добавить пользователя';
        form.reset();
        document.getElementById('userId').value = '';
    }

    modal.style.display = 'flex';
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('userModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }, 300);
}

async function editUser(id) {
    try {
        const user = await apiRequest(`${API_BASE}/${id}`);
        openModal(user);
    } catch (error) {
        console.error('Failed to load user for editing:', error);
    }
}

async function deleteUserConfirm(id) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
        return;
    }

    try {
        await deleteUser(id);
        showNotification('Пользователь успешно удален', 'success');
        await loadUsers();
    } catch (error) {
        console.error('Failed to delete user:', error);
    }
}

// Form handling
document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('userId').value;
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();

    if (!name || !email) {
        showNotification('Пожалуйста, заполните все поля', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showNotification('Пожалуйста, введите корректный email', 'error');
        return;
    }

    const userData = { name, email };
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Сохранение...';

        if (userId) {
            await updateUser(userId, { ...userData, id: parseInt(userId) });
            showNotification('Пользователь успешно обновлен', 'success');
        } else {
            await createUser(userData);
            showNotification('Пользователь успешно добавлен', 'success');
        }

        closeModal();
        await loadUsers();
    } catch (error) {
        console.error('Failed to save user:', error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// Utility functions
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.style.display = 'block';
        loading.innerHTML = '<div class="spinner"></div> Загрузка...';
    } else {
        loading.style.display = 'none';
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// New feature: Stats loading
async function loadStats() {
    try {
        const stats = await apiRequest('/api/stats');
        updateStatsDisplay(stats);
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function updateStatsDisplay(stats) {
    const statsElement = document.getElementById('statsDisplay');
    if (statsElement) {
        statsElement.innerHTML = `
            <div class="stats-card">
                <h4>📊 Статистика сервера</h4>
                <p>Пользователей: ${stats.total_users}</p>
                <p>Статус: <span class="status-online">${stats.status}</span></p>
                <p>Версия: ${stats.version}</p>
            </div>
        `;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadStats();

    // Close modal when clicking outside or pressing ESC
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('userModal');
        if (e.target === modal) {
            closeModal();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Add animation to cards on load
    setTimeout(() => {
        const cards = document.querySelectorAll('.user-card');
        cards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
        });
    }, 100);
});

// Typewriter effect for hero text
function initTypewriter() {
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
        const text = heroTitle.textContent;
        heroTitle.textContent = '';
        let i = 0;

        function typeWriter() {
            if (i < text.length) {
                heroTitle.textContent += text.charAt(i);
                i++;
                setTimeout(typeWriter, 50);
            }
        }

        setTimeout(typeWriter, 1000);
    }
}

// Initialize when page loads
window.onload = function () {
    initTypewriter();
};