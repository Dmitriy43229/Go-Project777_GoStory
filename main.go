package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// User структура для пользователя
type User struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// InMemoryDB простая база данных в памяти
type InMemoryDB struct {
	users  map[int]User
	mutex  sync.RWMutex
	nextID int
}

var db *InMemoryDB

// Глобальная переменная режима работы
var serverMode = "server" // "server" или "local"
var modeMutex sync.RWMutex

// Структура для клиентских подключений (для мгновенного обновления)
var (
	clients      = make(map[chan string]bool)
	clientsMutex sync.RWMutex
)

func init() {
	db = &InMemoryDB{
		users:  make(map[int]User),
		nextID: 4,
	}
	// Начальные данные
	now := time.Now()
	db.users[1] = User{ID: 1, Name: "Алексей Иванов", Email: "alex@example.com", CreatedAt: now.Add(-72 * time.Hour)}
	db.users[2] = User{ID: 2, Name: "Мария Петрова", Email: "maria@example.com", CreatedAt: now.Add(-48 * time.Hour)}
	db.users[3] = User{ID: 3, Name: "Иван Сидоров", Email: "ivan@company.ru", CreatedAt: now.Add(-24 * time.Hour)}
}

// Функция отправки обновления всем клиентам
func broadcastModeChange(newMode string) {
	clientsMutex.RLock()
	defer clientsMutex.RUnlock()
	
	message := fmt.Sprintf(`{"event": "mode_changed", "mode": "%s", "timestamp": %d}`, 
		newMode, time.Now().Unix())
	
	for clientChan := range clients {
		select {
		case clientChan <- message:
			// Сообщение отправлено
		default:
			// Канал заблокирован, пропускаем
		}
	}
	
	fmt.Printf("📢 Отправлено обновление режима '%s' для %d клиентов\n", newMode, len(clients))
}

// CORS middleware
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Password, X-Admin-Token")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// Проверка режима работы с 404 ошибкой для обычных пользователей
func checkModeMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		modeMutex.RLock()
		currentMode := serverMode
		modeMutex.RUnlock()
		
		// Всегда разрешаем доступ к этим endpoint-ам
		if r.URL.Path == "/api/mode" || r.URL.Path == "/api/admin/mode" || 
		   r.URL.Path == "/api/stats" || r.URL.Path == "/" ||
		   r.URL.Path == "/api/status" || r.URL.Path == "/api/info" ||
		   r.URL.Path == "/api/events" {
			next(w, r)
			return
		}
		
		// Если режим локальный, проверяем админский доступ
		if currentMode == "local" {
			isAdmin := checkAdminAccess(r)
			
			// Если это не админ - возвращаем 404
			if !isAdmin {
				w.WriteHeader(http.StatusNotFound)
				w.Header().Set("Content-Type", "text/html")
				
				// Генерируем HTML с текущим временем
				html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Страница не найдена</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: white;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .container {
            padding: 3rem;
            max-width: 600px;
        }
        h1 {
            font-size: 4rem;
            color: #dc2626;
            margin-bottom: 1rem;
        }
        h2 {
            font-size: 2rem;
            margin-bottom: 1.5rem;
            color: #4b5563;
        }
        p {
            font-size: 1.2rem;
            color: #6b7280;
            margin-bottom: 2rem;
            line-height: 1.6;
        }
        .status {
            font-size: 1rem;
            color: #9ca3af;
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e5e7eb;
        }
        .admin-note {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 1rem;
            margin-top: 2rem;
            color: #92400e;
        }
        .refresh-btn {
            margin-top: 2rem;
            padding: 0.75rem 1.5rem;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            transition: background 0.3s;
        }
        .refresh-btn:hover {
            background: #2563eb;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>404</h1>
        <h2>Страница временно недоступна</h2>
        <p>
            <strong>UserManager Pro находится в локальном режиме.</strong><br>
            В данный момент администратор работает с системой локально.
        </p>
        <p>
            Пожалуйста, попробуйте зайти позже, когда система вернется в серверный режим.
        </p>
        <div class="admin-note">
            <strong>Примечание для администратора:</strong><br>
            Для возврата в серверный режим нажмите кнопку "Режим: Локальный" на главной странице.
        </div>
        <button class="refresh-btn" onclick="location.reload()">
            🔄 Обновить страницу
        </button>
        <div class="status">
            UserManager Pro • Локальный режим активен • Время: %s
        </div>
    </div>
    <script>
        // Автоматическая проверка каждые 2 секунды
        const eventSource = new EventSource('/api/events');
        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.event === 'mode_changed' && data.mode === 'server') {
                console.log('Режим изменился на серверный, перезагружаем...');
                location.reload();
            }
        };
        
        // Также проверяем каждые 3 секунды обычным запросом
        setInterval(() => {
            fetch('/api/status?_=' + Date.now())
                .then(response => response.json())
                .then(data => {
                    if (data.mode === 'server') {
                        location.reload();
                    }
                });
        }, 3000);
    </script>
</body>
</html>`, time.Now().Format("15:04:05"))
				
				fmt.Fprint(w, html)
				return
			}
		}
		
		next(w, r)
	}
}

// Проверка админского доступа
func checkAdminAccess(r *http.Request) bool {
	// Проверяем админские заголовки
	adminToken := r.Header.Get("X-Admin-Token")
	adminPassword := r.Header.Get("X-Admin-Password")
	
	if adminToken == "admin_local_token_123" || adminPassword == "admin123" {
		return true
	}
	
	// Проверяем query параметры
	tokenFromQuery := r.URL.Query().Get("admin_token")
	if tokenFromQuery == "admin_local_token_123" {
		return true
	}
	
	return false
}

// validateUser проверяет обязательные поля
func validateUser(user User) error {
	if strings.TrimSpace(user.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if strings.TrimSpace(user.Email) == "" {
		return fmt.Errorf("email is required")
	}
	if !strings.Contains(user.Email, "@") {
		return fmt.Errorf("invalid email format")
	}
	return nil
}

// Add добавляет пользователя
func (db *InMemoryDB) Add(user User) (User, error) {
	if err := validateUser(user); err != nil {
		return User{}, err
	}

	db.mutex.Lock()
	defer db.mutex.Unlock()

	user.ID = db.nextID
	user.CreatedAt = time.Now()
	db.users[user.ID] = user
	db.nextID++
	return user, nil
}

// GetAll возвращает всех пользователей
func (db *InMemoryDB) GetAll() []User {
	db.mutex.RLock()
	defer db.mutex.RUnlock()

	users := make([]User, 0, len(db.users))
	for _, user := range db.users {
		users = append(users, user)
	}
	return users
}

// GetByID возвращает пользователя по ID
func (db *InMemoryDB) GetByID(id int) (User, bool) {
	db.mutex.RLock()
	defer db.mutex.RUnlock()

	user, exists := db.users[id]
	return user, exists
}

// Update обновляет пользователя
func (db *InMemoryDB) Update(id int, user User) error {
	if err := validateUser(user); err != nil {
		return err
	}

	db.mutex.Lock()
	defer db.mutex.Unlock()

	if _, exists := db.users[id]; !exists {
		return fmt.Errorf("user not found")
	}

	user.ID = id
	user.CreatedAt = db.users[id].CreatedAt // Сохраняем оригинальное время создания
	db.users[id] = user
	return nil
}

// Delete удаляет пользователя
func (db *InMemoryDB) Delete(id int) bool {
	db.mutex.Lock()
	defer db.mutex.Unlock()

	if _, exists := db.users[id]; exists {
		delete(db.users, id)
		return true
	}
	return false
}

// sendJSON отправляет JSON-ответ
func sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// sendError отправляет JSON-ошибку
func sendError(w http.ResponseWriter, status int, message string) {
	sendJSON(w, status, map[string]string{"error": message})
}

// Обработчики HTTP

func homeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()
	
	sendJSON(w, http.StatusOK, map[string]string{
		"message": "UserManager Pro API",
		"version": "1.0.0",
		"mode":    currentMode,
		"docs":    "/api/info",
	})
}

func apiUsersHandler(w http.ResponseWriter, r *http.Request) {
	// Сначала проверяем режим
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()
	
	// В локальном режиме проверяем админский доступ
	if currentMode == "local" {
		if !checkAdminAccess(r) {
			// Возвращаем 404 для обычных пользователей
			w.WriteHeader(http.StatusNotFound)
			w.Header().Set("Content-Type", "text/html")
			html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Страница не найдена</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: white;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .container {
            padding: 3rem;
            max-width: 600px;
        }
        h1 {
            font-size: 4rem;
            color: #dc2626;
            margin-bottom: 1rem;
        }
        h2 {
            font-size: 2rem;
            margin-bottom: 1.5rem;
            color: #4b5563;
        }
        p {
            font-size: 1.2rem;
            color: #6b7280;
            margin-bottom: 2rem;
            line-height: 1.6;
        }
        .status {
            font-size: 1rem;
            color: #9ca3af;
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e5e7eb;
        }
        .admin-note {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 1rem;
            margin-top: 2rem;
            color: #92400e;
        }
        .refresh-btn {
            margin-top: 2rem;
            padding: 0.75rem 1.5rem;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            transition: background 0.3s;
        }
        .refresh-btn:hover {
            background: #2563eb;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>404</h1>
        <h2>Страница временно недоступна</h2>
        <p>
            <strong>UserManager Pro находится в локальном режиме.</strong><br>
            В данный момент администратор работает с системой локально.
        </p>
        <p>
            Пожалуйста, попробуйте зайти позже, когда система вернется в серверный режим.
        </p>
        <div class="admin-note">
            <strong>Примечание для администратора:</strong><br>
            Для возврата в серверный режим нажмите кнопку "Режим: Локальный" на главной странице.
        </div>
        <button class="refresh-btn" onclick="location.reload()">
            🔄 Обновить страницу
        </button>
        <div class="status">
            UserManager Pro • Локальный режим активен • Время: %s
        </div>
    </div>
    <script>
        // Автоматическая проверка каждые 2 секунды
        const eventSource = new EventSource('/api/events');
        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.event === 'mode_changed' && data.mode === 'server') {
                console.log('Режим изменился на серверный, перезагружаем...');
                location.reload();
            }
        };
        
        setInterval(() => {
            fetch('/api/status?_=' + Date.now())
                .then(response => response.json())
                .then(data => {
                    if (data.mode === 'server') {
                        location.reload();
                    }
                });
        }, 3000);
    </script>
</body>
</html>`, time.Now().Format("15:04:05"))
			fmt.Fprint(w, html)
			return
		}
	}
	
	switch r.Method {
	case http.MethodGet:
		users := db.GetAll()
		sendJSON(w, http.StatusOK, users)

	case http.MethodPost:
		var user User
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			sendError(w, http.StatusBadRequest, "Invalid JSON")
			return
		}

		newUser, err := db.Add(user)
		if err != nil {
			sendError(w, http.StatusBadRequest, err.Error())
			return
		}
		sendJSON(w, http.StatusCreated, newUser)

	default:
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func apiUserHandler(w http.ResponseWriter, r *http.Request) {
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()
	
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) != 3 {
		sendError(w, http.StatusBadRequest, "Invalid URL")
		return
	}

	idStr := pathParts[2]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	// В локальном режиме проверяем админский доступ
	if currentMode == "local" {
		if !checkAdminAccess(r) {
			sendError(w, http.StatusNotFound, "Локальный режим активен")
			return
		}
	}

	switch r.Method {
	case http.MethodGet:
		user, exists := db.GetByID(id)
		if !exists {
			sendError(w, http.StatusNotFound, "User not found")
			return
		}
		sendJSON(w, http.StatusOK, user)

	case http.MethodPut:
		var user User
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			sendError(w, http.StatusBadRequest, "Invalid JSON")
			return
		}

		if err := db.Update(id, user); err != nil {
			status := http.StatusInternalServerError
			if err.Error() == "user not found" {
				status = http.StatusNotFound
			} else {
				status = http.StatusBadRequest
			}
			sendError(w, status, err.Error())
			return
		}
		sendJSON(w, http.StatusOK, user)

	case http.MethodDelete:
		if deleted := db.Delete(id); !deleted {
			sendError(w, http.StatusNotFound, "User not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func apiStatsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()

	stats := map[string]interface{}{
		"total_users": len(db.users),
		"server_time": time.Now().UTC(),
		"status":      "online",
		"version":     "1.0.0",
		"go_version":  "1.23.1",
		"mode":        currentMode,
	}
	
	// В локальном режиме показываем 0 пользователей для обычных пользователей
	if currentMode == "local" {
		if !checkAdminAccess(r) {
			stats["total_users"] = 0
			stats["message"] = "Локальный режим активен. Данные скрыты."
			stats["status"] = "local"
		}
	}
	
	sendJSON(w, http.StatusOK, stats)
}

func apiInfoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()

	info := map[string]interface{}{
		"name":        "UserManager Pro API",
		"version":     "1.0.0",
		"description": "Go Backend API for UserManager Pro",
		"author":      "Dmitriy Kobelev",
		"mode":        currentMode,
		"endpoints": map[string]string{
			"GET /api/users":           "Get all users",
			"POST /api/users":          "Create user",
			"GET /api/users/{id}":      "Get user by ID",
			"PUT /api/users/{id}":      "Update user",
			"DELETE /api/users/{id}":   "Delete user",
			"GET /api/stats":           "Server statistics",
			"GET /api/info":            "This info",
			"POST /api/admin/mode":     "Change mode (admin only)",
			"GET /api/mode":            "Get current mode",
			"GET /api/status":          "Check status and mode",
			"GET /api/events":          "Server-Sent Events для обновлений",
		},
		"frontend": "https://dmitriy43229.github.io/Go-Project777_GoStory/",
	}
	
	// Для обычных пользователей в локальном режиме скрываем информацию
	if currentMode == "local" {
		if !checkAdminAccess(r) {
			info["message"] = "Локальный режим активен"
			info["endpoints"] = map[string]string{
				"GET /api/status": "Check system status",
				"GET /api/events": "Get real-time updates",
			}
		}
	}
	
	sendJSON(w, http.StatusOK, info)
}

// Новый обработчик для проверки статуса
func apiStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()
	
	// Проверяем админский доступ
	isAdmin := checkAdminAccess(r)
	
	response := map[string]interface{}{
		"mode":      currentMode,
		"is_admin":  isAdmin,
		"timestamp": time.Now().Unix(),
		"status":    "ok",
	}
	
	// Если режим локальный и не админ - сообщаем о блокировке
	if currentMode == "local" && !isAdmin {
		response["blocked"] = true
		response["message"] = "Локальный режим активен"
	}
	
	sendJSON(w, http.StatusOK, response)
}

// Server-Sent Events для мгновенных обновлений
func apiEventsHandler(w http.ResponseWriter, r *http.Request) {
	// Устанавливаем заголовки для SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	// Создаем канал для этого клиента
	messageChan := make(chan string, 10)
	
	// Регистрируем клиента
	clientsMutex.Lock()
	clients[messageChan] = true
	clientsMutex.Unlock()
	
	fmt.Printf("📡 Новый клиент подключен. Всего клиентов: %d\n", len(clients))
	
	// Отправляем текущий режим сразу при подключении
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()
	
	initialMessage := fmt.Sprintf(`{"event": "connected", "mode": "%s", "timestamp": %d}`, 
		currentMode, time.Now().Unix())
	fmt.Fprintf(w, "data: %s\n\n", initialMessage)
	
	// Принудительно отправляем данные
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	
	// Отслеживаем отключение клиента
	notify := w.(http.CloseNotifier).CloseNotify()
	
	// Бесконечный цикл для отправки сообщений
	for {
		select {
		case <-notify:
			// Клиент отключился
			clientsMutex.Lock()
			delete(clients, messageChan)
			clientsMutex.Unlock()
			close(messageChan)
			fmt.Printf("📡 Клиент отключился. Осталось клиентов: %d\n", len(clients))
			return
			
		case msg := <-messageChan:
			// Отправляем сообщение клиенту
			fmt.Fprintf(w, "data: %s\n\n", msg)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			
		case <-time.After(30 * time.Second):
			// Отправляем ping каждые 30 секунд чтобы соединение не разрывалось
			pingMsg := fmt.Sprintf(`{"event": "ping", "timestamp": %d}`, time.Now().Unix())
			fmt.Fprintf(w, "data: %s\n\n", pingMsg)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}
}

// Новые обработчики для управления режимом

func apiAdminModeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	// Проверяем админский пароль
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	
	if body["password"] != "admin123" {
		sendError(w, http.StatusUnauthorized, "Invalid admin password")
		return
	}
	
	newMode := body["mode"]
	if newMode != "server" && newMode != "local" {
		sendError(w, http.StatusBadRequest, "Mode must be 'server' or 'local'")
		return
	}
	
	modeMutex.Lock()
	oldMode := serverMode
	serverMode = newMode
	modeMutex.Unlock()
	
	// Отправляем обновление ВСЕМ подключенным клиентам
	broadcastModeChange(newMode)
	
	// Логируем изменение
	fmt.Printf("\n🎯 РЕЖИМ ИЗМЕНЕН!\n")
	fmt.Printf("   Старый режим: %s\n", oldMode)
	fmt.Printf("   Новый режим: %s\n", newMode)
	fmt.Printf("   Время: %s\n", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Printf("   IP админ: %s\n", r.RemoteAddr)
	fmt.Printf("   Уведомлено клиентов: %d\n", len(clients))
	
	if newMode == "local" {
		fmt.Printf("   ⚠️  ВНИМАНИЕ: Все обычные пользователи теперь увидят белую страницу 404!\n")
		fmt.Printf("   ✅ Только администратор может работать с системой\n")
	} else {
		fmt.Printf("   ✅ Теперь все пользователи видят общие данные\n")
	}
	
	response := map[string]string{
		"message": fmt.Sprintf("Режим изменен с '%s' на '%s'", oldMode, newMode),
		"mode":    newMode,
		"time":    time.Now().Format("2006-01-02 15:04:05"),
		"clients": fmt.Sprintf("%d", len(clients)),
		"warning": "",
	}
	
	if newMode == "local" {
		response["warning"] = "Обычные пользователи увидят 404 страницу"
	} else {
		response["warning"] = "Все пользователи видят данные"
	}
	
	sendJSON(w, http.StatusOK, response)
}

func apiGetModeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()
	
	sendJSON(w, http.StatusOK, map[string]string{
		"mode": currentMode,
	})
}

func main() {
	// Регистрация маршрутов с CORS
	http.HandleFunc("/api/users", enableCORS(checkModeMiddleware(apiUsersHandler)))
	http.HandleFunc("/api/users/", enableCORS(checkModeMiddleware(apiUserHandler)))
	http.HandleFunc("/api/stats", enableCORS(apiStatsHandler))
	http.HandleFunc("/api/info", enableCORS(checkModeMiddleware(apiInfoHandler)))
	http.HandleFunc("/api/admin/mode", enableCORS(apiAdminModeHandler))
	http.HandleFunc("/api/mode", enableCORS(apiGetModeHandler))
	http.HandleFunc("/api/status", enableCORS(apiStatusHandler))
	http.HandleFunc("/api/events", enableCORS(apiEventsHandler))
	http.HandleFunc("/", enableCORS(homeHandler))

	port := ":8068"
	fmt.Printf("🚀 Go API сервер запущен на порту %s\n", port)
	fmt.Printf("📊 База данных инициализирована с %d пользователями\n", len(db.users))
	fmt.Printf("🌐 Начальный режим: %s\n", serverMode)
	fmt.Println("\n🔧 Управление режимами:")
	fmt.Println("   POST /api/admin/mode - Изменить режим (требуется пароль admin123)")
	fmt.Println("   GET  /api/mode       - Получить текущий режим")
	fmt.Println("   GET  /api/status     - Проверить статус и доступ")
	fmt.Println("   GET  /api/events     - Server-Sent Events для мгновенных обновлений")
	fmt.Println("\n🔒 Локальный режим:")
	fmt.Println("   - Обычные пользователи немедленно получают 404 ошибку")
	fmt.Println("   - Белый экран с сообщением для не-админов")
	fmt.Println("   - Мгновенное обновление через SSE для всех клиентов")
	fmt.Println("   - Админский токен: admin_local_token_123")
	fmt.Println("   - Админский пароль: admin123 (в заголовках)")
	fmt.Println("\n⚡ Мгновенное обновление:")
	fmt.Println("   - Все клиенты получают уведомление при смене режима")
	fmt.Println("   - Автоматическая перезагрузка страниц")
	fmt.Println("   - Режим меняется у всех пользователей одновременно")
	fmt.Println("\n⚠️  ВАЖНО: При включении локального режима все обычные пользователи")
	fmt.Println("          сразу увидят белую страницу 404!")
	fmt.Println("\n🌐 API Endpoints:")
	fmt.Println("   GET  /api/users      - Все пользователи")
	fmt.Println("   POST /api/users      - Создать пользователя")
	fmt.Println("   GET  /api/users/{id} - Получить пользователя")
	fmt.Println("   PUT  /api/users/{id} - Обновить пользователя")
	fmt.Println("   DELETE /api/users/{id} - Удалить пользователя")
	fmt.Println("   GET  /api/stats      - Статистика сервера")
	fmt.Println("   GET  /api/info       - Информация об API")
	fmt.Println("   GET  /api/status     - Проверить статус системы")
	fmt.Println("   GET  /api/events     - Получить мгновенные обновления")
	fmt.Println("\n🔗 Frontend доступен по адресу:")
	fmt.Println("   https://dmitriy43229.github.io/Go-Project777_GoStory/")

	log.Fatal(http.ListenAndServe(port, nil))
}