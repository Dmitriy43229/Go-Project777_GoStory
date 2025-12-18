package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
	
	"github.com/gorilla/websocket"
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

// Глобальные переменные для управления режимом и клиентами
var (
	serverMode     = "server" // "server" или "local"
	modeMutex      sync.RWMutex
	lastModeChange time.Time
	startTime      time.Time
	
	// WebSocket
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
		HandshakeTimeout: 5 * time.Second,
		ReadBufferSize:   1024,
		WriteBufferSize:  1024,
	}
	
	// Клиенты WebSocket
	clients    = make(map[*websocket.Conn]bool)
	clientsMu  sync.RWMutex
	
	// Клиентская информация
	clientInfo = make(map[*websocket.Conn]*ClientData)
	infoMu     sync.RWMutex
)

type ClientData struct {
	IP        string
	IsAdmin   bool
	LastSeen  time.Time
	UserAgent string
	ClientID  string
}

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
	
	lastModeChange = time.Now()
	startTime = time.Now()
}

// Функция отправки сообщения всем клиентам с оптимизацией
func broadcastToAll(messageType string, data interface{}) {
	// Создаем копию клиентов для безопасной итерации
	clientsMu.RLock()
	clientsCopy := make([]*websocket.Conn, 0, len(clients))
	for client := range clients {
		clientsCopy = append(clientsCopy, client)
	}
	clientsMu.RUnlock()
	
	// Подготавливаем сообщение один раз
	message := map[string]interface{}{
		"type": messageType,
		"data": data,
		"time": time.Now().Unix(),
	}
	
	jsonMessage, err := json.Marshal(message)
	if err != nil {
		log.Printf("❌ Ошибка маршалинга сообщения: %v", err)
		return
	}
	
	activeClients := 0
	deadClients := make([]*websocket.Conn, 0)
	
	for _, client := range clientsCopy {
		// Проверяем, существует ли еще соединение
		clientsMu.RLock()
		exists := clients[client]
		clientsMu.RUnlock()
		
		if !exists {
			continue
		}
		
		// Обновляем время последней активности
		infoMu.Lock()
		if info, exists := clientInfo[client]; exists {
			info.LastSeen = time.Now()
		}
		infoMu.Unlock()
		
		// Устанавливаем таймаут на запись
		client.SetWriteDeadline(time.Now().Add(3 * time.Second))
		
		// Отправляем сообщение
		err := client.WriteMessage(websocket.TextMessage, jsonMessage)
		
		if err != nil {
			log.Printf("❌ Ошибка отправки клиенту: %v", err)
			deadClients = append(deadClients, client)
		} else {
			activeClients++
		}
	}
	
	// Удаляем мертвых клиентов
	if len(deadClients) > 0 {
		go cleanupDeadClients(deadClients)
	}
	
	if activeClients > 0 {
		log.Printf("📢 Отправлено сообщение '%s' для %d/%d клиентов", messageType, activeClients, len(clientsCopy))
	}
}

// Функция очистки мертвых клиентов
func cleanupDeadClients(deadClients []*websocket.Conn) {
	clientsMu.Lock()
	infoMu.Lock()
	
	for _, client := range deadClients {
		delete(clients, client)
		delete(clientInfo, client)
		client.Close()
	}
	
	infoMu.Unlock()
	clientsMu.Unlock()
	
	log.Printf("🧹 Очищено %d мертвых клиентов", len(deadClients))
}

// Функция отправки сообщения конкретному клиенту с таймаутом
func sendToClient(client *websocket.Conn, messageType string, data interface{}) error {
	message := map[string]interface{}{
		"type": messageType,
		"data": data,
		"time": time.Now().Unix(),
	}
	
	jsonMessage, err := json.Marshal(message)
	if err != nil {
		return err
	}
	
	// Устанавливаем таймаут на запись
	client.SetWriteDeadline(time.Now().Add(3 * time.Second))
	return client.WriteMessage(websocket.TextMessage, jsonMessage)
}

// Обработчик WebSocket с оптимизациями
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("❌ Ошибка обновления WebSocket: %v", err)
		return
	}
	
	// Устанавливаем таймауты
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		
		// Обновляем время последней активности
		infoMu.Lock()
		if info, exists := clientInfo[conn]; exists {
			info.LastSeen = time.Now()
		}
		infoMu.Unlock()
		
		return nil
	})
	
	// Регистрируем клиента
	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()
	
	// Получаем или генерируем ClientID
	clientID := r.URL.Query().Get("clientId")
	if clientID == "" {
		clientID = "client_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	
	// Сохраняем информацию о клиенте
	ip := strings.Split(r.RemoteAddr, ":")[0]
	infoMu.Lock()
	clientInfo[conn] = &ClientData{
		IP:        ip,
		IsAdmin:   checkAdminAccess(r),
		LastSeen:  time.Now(),
		UserAgent: r.UserAgent(),
		ClientID:  clientID,
	}
	infoMu.Unlock()
	
	log.Printf("🔗 Новый WebSocket клиент подключен: %s (ID: %s, Всего: %d)", ip, clientID, len(clients))
	
	// Отправляем приветственное сообщение с таймаутом
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	
	go func() {
		select {
		case <-ctx.Done():
			log.Printf("⚠️ Таймаут отправки приветственного сообщения клиенту %s", clientID)
			return
		default:
			modeMutex.RLock()
			currentMode := serverMode
			modeMutex.RUnlock()
			
			welcomeMsg := map[string]interface{}{
				"mode":        currentMode,
				"clients":     len(clients),
				"is_admin":    checkAdminAccess(r),
				"server_time": time.Now().Format("2006-01-02 15:04:05"),
				"client_id":   clientID,
			}
			
			if err := sendToClient(conn, "connected", welcomeMsg); err != nil {
				log.Printf("❌ Ошибка отправки приветствия клиенту %s: %v", clientID, err)
			}
		}
	}()
	
	// Обрабатываем сообщения от клиента
	go handleClientMessages(conn, ip, clientID)
}

// Обработка сообщений от клиента
func handleClientMessages(conn *websocket.Conn, ip, clientID string) {
	defer func() {
		// Удаляем клиента при отключении
		clientsMu.Lock()
		delete(clients, conn)
		clientsMu.Unlock()
		infoMu.Lock()
		delete(clientInfo, conn)
		infoMu.Unlock()
		conn.Close()
		
		log.Printf("🔗 WebSocket клиент отключен: %s (ID: %s, Осталось: %d)", ip, clientID, len(clients))
	}()
	
	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("❌ WebSocket ошибка чтения от %s: %v", clientID, err)
			}
			break
		}
		
		if messageType == websocket.TextMessage {
			var msg map[string]interface{}
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("❌ Ошибка парсинга сообщения от %s: %v", clientID, err)
				continue
			}
			
			switch msg["type"] {
			case "ping":
				// Обновляем время последней активности
				infoMu.Lock()
				if info, exists := clientInfo[conn]; exists {
					info.LastSeen = time.Now()
				}
				infoMu.Unlock()
				
				// Отвечаем на ping
				sendToClient(conn, "pong", map[string]interface{}{
					"time":      time.Now().Unix(),
					"client_id": msg["clientId"],
				})
				
			case "pong":
				// Обновляем таймаут чтения
				conn.SetReadDeadline(time.Now().Add(60 * time.Second))
				infoMu.Lock()
				if info, exists := clientInfo[conn]; exists {
					info.LastSeen = time.Now()
				}
				infoMu.Unlock()
				
			case "connect":
				// Обновляем ClientID
				if newClientID, ok := msg["clientId"].(string); ok && newClientID != "" {
					infoMu.Lock()
					if info, exists := clientInfo[conn]; exists {
						info.ClientID = newClientID
					}
					infoMu.Unlock()
				}
				
			case "get_mode":
				// Отправляем текущий режим
				modeMutex.RLock()
				currentMode := serverMode
				modeMutex.RUnlock()
				
				sendToClient(conn, "mode_info", map[string]interface{}{
					"mode":    currentMode,
					"clients": len(clients),
				})
				
			default:
				// Обновляем время последней активности для любого сообщения
				infoMu.Lock()
				if info, exists := clientInfo[conn]; exists {
					info.LastSeen = time.Now()
				}
				infoMu.Unlock()
			}
		}
	}
}

// CORS middleware
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Password, X-Admin-Token")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// Проверка режима работы с оптимизацией
func checkModeMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		modeMutex.RLock()
		currentMode := serverMode
		modeMutex.RUnlock()
		
		// Всегда разрешаем доступ к этим endpoint-ам
		if r.URL.Path == "/api/mode" || r.URL.Path == "/api/admin/mode" || 
		   r.URL.Path == "/api/stats" || r.URL.Path == "/" ||
		   r.URL.Path == "/api/status" || r.URL.Path == "/api/info" ||
		   r.URL.Path == "/api/health" || r.URL.Path == "/api/check-mode" ||
		   r.URL.Path == "/ws" || strings.HasPrefix(r.URL.Path, "/api/") {
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
        <button class="refresh-btn" onclick="checkForUpdates()">
            🔄 Проверить обновления
        </button>
        <div class="status">
            UserManager Pro • Локальный режим активен • Время: %s
        </div>
    </div>
    <script>
        function checkForUpdates() {
            fetch('/api/check-mode?_=' + Date.now())
                .then(response => response.json())
                .then(data => {
                    if (data.mode === 'server') {
                        location.reload(true);
                    } else {
                        alert('Режим все еще локальный. Попробуйте позже.');
                    }
                });
        }
        
        // Автоматическая проверка каждые 3 секунды
        setInterval(checkForUpdates, 3000);
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
	
	if adminToken == "admin_local_token_123" || adminPassword == "D607206fd-" {
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
	
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"message": "UserManager Pro API",
		"version": "1.0.0",
		"mode":    currentMode,
		"clients": len(clients),
		"docs":    "/api/info",
		"uptime":  time.Since(startTime).String(),
	})
}

func apiUsersHandler(w http.ResponseWriter, r *http.Request) {
	modeMutex.RLock()
	currentMode := serverMode
	modeMutex.RUnlock()
	
	// В локальном режиме проверяем админский доступ
	if currentMode == "local" {
		if !checkAdminAccess(r) {
			sendError(w, http.StatusNotFound, "Локальный режим активен")
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
		"clients":     len(clients),
		"uptime":      time.Since(startTime).String(),
		"memory_mb":   getMemoryUsage(),
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

// Вспомогательная функция для получения использования памяти
func getMemoryUsage() float64 {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return float64(m.Alloc) / 1024 / 1024
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
		"clients":     len(clients),
		"uptime":      time.Since(startTime).String(),
		"endpoints": map[string]string{
			"GET /api/users":           "Get all users",
			"POST /api/users":          "Create user",
			"GET /api/users/{id}":      "Get user by ID",
			"PUT /api/users/{id}":      "Update user",
			"DELETE /api/users/{id}":   "Delete user",
			"GET /api/stats":           "Server statistics",
			"GET /api/info":            "This info",
			"GET /api/health":          "Health check",
			"POST /api/admin/mode":     "Change mode (admin only)",
			"GET /api/mode":            "Get current mode",
			"GET /api/status":          "Check status and mode",
			"GET /api/clients":         "Get connected clients",
			"GET /api/check-mode":      "Check if mode changed",
			"WS /ws":                   "WebSocket for real-time updates",
		},
		"frontend": "https://dmitriy43229.github.io/Go-Project777_GoStory/",
	}
	
	sendJSON(w, http.StatusOK, info)
}

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
		"mode":        currentMode,
		"is_admin":    isAdmin,
		"timestamp":   time.Now().Unix(),
		"status":      "ok",
		"clients":     len(clients),
		"server_time": time.Now().Format("2006-01-02 15:04:05"),
		"uptime":      time.Since(startTime).String(),
	}
	
	// Если режим локальный и не админ - сообщаем о блокировке
	if currentMode == "local" && !isAdmin {
		response["blocked"] = true
		response["message"] = "Локальный режим активен"
		response["status"] = "blocked"
	}
	
	sendJSON(w, http.StatusOK, response)
}

// Health check endpoint
func apiHealthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	healthStatus := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().Unix(),
		"version":   "1.0.0",
		"mode":      serverMode,
		"clients":   len(clients),
		"uptime":    time.Since(startTime).String(),
		"memory_mb": getMemoryUsage(),
	}
	
	sendJSON(w, http.StatusOK, healthStatus)
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
	
	if body["password"] != "D607206fd-" {
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
	lastModeChange = time.Now()
	modeMutex.Unlock()
	
	// Отправляем обновление ВСЕМ подключенным клиентам через WebSocket
	broadcastToAll("mode_changed", map[string]interface{}{
		"old_mode":      oldMode,
		"new_mode":      newMode,
		"time":          time.Now().Unix(),
		"force_reload":  true,
		"changed_by":    r.RemoteAddr,
	})
	
	// Небольшая задержка для гарантии отправки
	time.Sleep(50 * time.Millisecond)
	
	// Также отправляем команду на принудительную перезагрузку
	broadcastToAll("force_reload", map[string]interface{}{
		"reason": "mode_changed_to_" + newMode,
		"time":   time.Now().Unix(),
	})
	
	// Логируем изменение
	log.Printf("\n🎯 РЕЖИМ ИЗМЕНЕН!")
	log.Printf("   Старый режим: %s", oldMode)
	log.Printf("   Новый режим: %s", newMode)
	log.Printf("   Время: %s", time.Now().Format("2006-01-02 15:04:05"))
	log.Printf("   IP админ: %s", r.RemoteAddr)
	log.Printf("   Активных клиентов: %d", len(clients))
	
	if newMode == "local" {
		log.Printf("   ⚠️  ВНИМАНИЕ: Все обычные пользователи теперь увидят белую страницу 404!")
		log.Printf("   ✅ Только администратор может работать с системой")
	} else {
		log.Printf("   ✅ Теперь все пользователи видят общие данные")
	}
	
	response := map[string]interface{}{
		"message": fmt.Sprintf("Режим изменен с '%s' на '%s'", oldMode, newMode),
		"mode":    newMode,
		"time":    time.Now().Format("2006-01-02 15:04:05"),
		"clients": len(clients),
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
	lastChange := lastModeChange
	modeMutex.RUnlock()
	
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"mode":         currentMode,
		"last_change":  lastChange.Format(time.RFC3339),
		"clients":      len(clients),
		"timestamp":    time.Now().Unix(),
		"uptime":       time.Since(startTime).String(),
	})
}

// Обработчик для проверки изменения режима
func apiCheckModeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	modeMutex.RLock()
	currentMode := serverMode
	lastChange := lastModeChange
	modeMutex.RUnlock()
	
	// Получаем время последней проверки клиента
	lastCheckStr := r.URL.Query().Get("last_check")
	var needsReload bool
	
	if lastCheckStr != "" {
		lastCheck, err := strconv.ParseInt(lastCheckStr, 10, 64)
		if err == nil {
			needsReload = lastChange.Unix() > lastCheck
		}
	}
	
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"mode":         currentMode,
		"last_change":  lastChange.Unix(),
		"needs_reload": needsReload,
		"timestamp":    time.Now().Unix(),
	})
}

// Обработчик для получения списка клиентов (только для админа)
func apiClientsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	if !checkAdminAccess(r) {
		sendError(w, http.StatusUnauthorized, "Admin access required")
		return
	}
	
	infoMu.RLock()
	clientsList := make([]map[string]interface{}, 0, len(clientInfo))
	for _, info := range clientInfo {
		clientsList = append(clientsList, map[string]interface{}{
			"ip":          info.IP,
			"client_id":   info.ClientID,
			"is_admin":    info.IsAdmin,
			"last_seen":   info.LastSeen.Format("2006-01-02 15:04:05"),
			"user_agent":  info.UserAgent,
			"connected":   time.Since(info.LastSeen) < 30*time.Second,
			"idle_time":   time.Since(info.LastSeen).Round(time.Second).String(),
		})
	}
	infoMu.RUnlock()
	
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"clients": clientsList,
		"total":   len(clientsList),
		"active":  len(clients),
	})
}

// Запускаем периодическую отправку ping сообщений
func startPingService() {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			broadcastToAll("ping", map[string]interface{}{
				"time":    time.Now().Unix(),
				"clients": len(clients),
			})
		}
	}()
}

// Функция для периодической очистки неактивных клиентов
func startClientCleanup() {
	ticker := time.NewTicker(60 * time.Second)
	go func() {
		for range ticker.C {
			cleanupInactiveClients()
		}
	}()
}

func cleanupInactiveClients() {
	clientsMu.Lock()
	infoMu.Lock()
	
	inactiveClients := 0
	now := time.Now()
	
	for client, info := range clientInfo {
		// Если клиент неактивен более 2 минут
		if now.Sub(info.LastSeen) > 120*time.Second {
			delete(clients, client)
			delete(clientInfo, client)
			client.Close()
			inactiveClients++
		}
	}
	
	infoMu.Unlock()
	clientsMu.Unlock()
	
	if inactiveClients > 0 {
		log.Printf("🧹 Очищено %d неактивных клиентов", inactiveClients)
	}
}

func main() {
	// Запускаем сервисы
	startPingService()
	startClientCleanup()
	
	// Регистрация маршрутов
	http.HandleFunc("/api/users", enableCORS(checkModeMiddleware(apiUsersHandler)))
	http.HandleFunc("/api/users/", enableCORS(checkModeMiddleware(apiUserHandler)))
	http.HandleFunc("/api/stats", enableCORS(apiStatsHandler))
	http.HandleFunc("/api/info", enableCORS(apiInfoHandler))
	http.HandleFunc("/api/health", enableCORS(apiHealthHandler))
	http.HandleFunc("/api/admin/mode", enableCORS(apiAdminModeHandler))
	http.HandleFunc("/api/mode", enableCORS(apiGetModeHandler))
	http.HandleFunc("/api/status", enableCORS(apiStatusHandler))
	http.HandleFunc("/api/check-mode", enableCORS(apiCheckModeHandler))
	http.HandleFunc("/api/clients", enableCORS(apiClientsHandler))
	http.HandleFunc("/ws", enableCORS(handleWebSocket))
	http.HandleFunc("/", enableCORS(homeHandler))

	port := ":8068"
	
	// Статистика сервера
	log.Printf("\n" + strings.Repeat("=", 60))
	log.Printf("🚀 UserManager Pro Server v1.0.0")
	log.Printf(strings.Repeat("=", 60))
	log.Printf("📊 Сервер запущен на порту %s", port)
	log.Printf("📁 База данных инициализирована с %d пользователями", len(db.users))
	log.Printf("🌐 Начальный режим: %s", serverMode)
	log.Printf("⏱️  Время запуска: %s", startTime.Format("2006-01-02 15:04:05"))
	log.Printf(strings.Repeat("-", 60))
	
	log.Printf("\n🔧 Управление режимами:")
	log.Printf("   POST /api/admin/mode - Изменить режим (пароль: ********)")
	log.Printf("   GET  /api/mode       - Получить текущий режим")
	log.Printf("   GET  /api/status     - Проверить статус и доступ")
	log.Printf("   GET  /api/health     - Проверить состояние сервера")
	log.Printf("   GET  /api/clients    - Получить список подключенных клиентов")
	log.Printf("   WS   /ws             - WebSocket для мгновенных обновлений")
	
	log.Printf("\n🔒 Локальный режим:")
	log.Printf("   - Обычные пользователи немедленно получают 404 ошибку")
	log.Printf("   - WebSocket уведомления для всех клиентов")
	log.Printf("   - Принудительная перезагрузка при смене режима")
	
	log.Printf("\n⚡ Мгновенное обновление через WebSocket:")
	log.Printf("   - Все клиенты получают уведомление при смене режима")
	log.Printf("   - Автоматическая перезагрузка страниц")
	log.Printf("   - Режим меняется у всех пользователей одновременно")
	log.Printf("   - Ping/pong для поддержания соединения")
	
	log.Printf("\n🌐 API Endpoints:")
	log.Printf("   GET  /api/users      - Все пользователи")
	log.Printf("   POST /api/users      - Создать пользователя")
	log.Printf("   GET  /api/stats      - Статистика сервера")
	log.Printf("   GET  /api/info       - Информация об API")
	log.Printf("   GET  /api/status     - Проверить статус системы")
	log.Printf("   GET  /api/check-mode - Проверить изменение режима")
	log.Printf("   WS   /ws             - WebSocket для реального времени")
	
	log.Printf("\n🔧 Технические особенности:")
	log.Printf("   - Таймаут подключения: 5 секунд")
	log.Printf("   - Таймаут чтения: 60 секунд")
	log.Printf("   - Автоматическая очистка неактивных клиентов")
	log.Printf("   - Оптимизированная рассылка сообщений")
	
	log.Printf(strings.Repeat("=", 60))
	log.Printf("\n✅ Сервер готов к работе!\n")

	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("❌ Ошибка запуска сервера: %v", err)
	}
}