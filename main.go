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

// CORS middleware
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Password")

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
		
		// Пропускаем проверку для endpoint получения режима и статистики
		if r.URL.Path == "/api/mode" || r.URL.Path == "/api/admin/mode" || r.URL.Path == "/api/stats" {
			next(w, r)
			return
		}
		
		// Если режим локальный, проверяем админский токен
		if currentMode == "local" {
			adminToken := r.Header.Get("X-Admin-Token")
			
			// Список разрешенных админских токенов
			allowedTokens := map[string]bool{
				"admin_local_token_123": true, // Токен для локального режима
			}
			
			if !allowedTokens[adminToken] {
				// Проверяем также в query параметрах
				tokenFromQuery := r.URL.Query().Get("admin_token")
				if !allowedTokens[tokenFromQuery] {
					// ВОТ ЗДЕСЬ ВАЖНОЕ ИЗМЕНЕНИЕ - возвращаем 404 вместо 403
					w.WriteHeader(http.StatusNotFound)
					w.Header().Set("Content-Type", "text/html")
					
					// HTML страница с белым фоном и сообщением
					html := `<!DOCTYPE html>
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
								padding: 2rem;
							}
							h1 {
								font-size: 4rem;
								color: #dc2626;
								margin-bottom: 1rem;
							}
							h2 {
								font-size: 2rem;
								margin-bottom: 1rem;
								color: #4b5563;
							}
							p {
								font-size: 1.2rem;
								color: #6b7280;
								margin-bottom: 2rem;
							}
							.status {
								font-size: 1rem;
								color: #9ca3af;
								margin-top: 2rem;
								padding-top: 1rem;
								border-top: 1px solid #e5e7eb;
							}
						</style>
					</head>
					<body>
						<div class="container">
							<h1>404</h1>
							<h2>Страница временно недоступна</h2>
							<p>В данный момент администратор работает в локальном режиме.<br>
							Пожалуйста, попробуйте позже.</p>
							<div class="status">
								UserManager Pro • Локальный режим активен • Время: ` + time.Now().Format("15:04:05") + `
							</div>
						</div>
					</body>
					</html>`
					
					fmt.Fprint(w, html)
					return
				}
			}
		}
		
		next(w, r)
	}
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
	switch r.Method {
	case http.MethodGet:
		modeMutex.RLock()
		currentMode := serverMode
		modeMutex.RUnlock()
		
		// Для локального режима возвращаем пустой массив для всех
		if currentMode == "local" {
			// Проверяем админский токен
			adminToken := r.Header.Get("X-Admin-Token")
			allowedTokens := map[string]bool{"admin_local_token_123": true}
			
			if !allowedTokens[adminToken] {
				tokenFromQuery := r.URL.Query().Get("admin_token")
				if !allowedTokens[tokenFromQuery] {
					// Для обычных пользователей возвращаем 404
					w.WriteHeader(http.StatusNotFound)
					return
				}
			}
			// Для админа возвращаем данные
			users := db.GetAll()
			sendJSON(w, http.StatusOK, users)
			return
		}
		
		users := db.GetAll()
		sendJSON(w, http.StatusOK, users)

	case http.MethodPost:
		modeMutex.RLock()
		currentMode := serverMode
		modeMutex.RUnlock()
		
		if currentMode == "local" {
			// Проверяем админский токен
			adminToken := r.Header.Get("X-Admin-Token")
			allowedTokens := map[string]bool{"admin_local_token_123": true}
			
			if !allowedTokens[adminToken] {
				tokenFromQuery := r.URL.Query().Get("admin_token")
				if !allowedTokens[tokenFromQuery] {
					sendError(w, http.StatusNotFound, "Локальный режим активен")
					return
				}
			}
		}
		
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

	// Проверяем режим для всех операций кроме GET
	if currentMode == "local" && r.Method != http.MethodGet {
		// Проверяем админский токен
		adminToken := r.Header.Get("X-Admin-Token")
		allowedTokens := map[string]bool{"admin_local_token_123": true}
		
		if !allowedTokens[adminToken] {
			tokenFromQuery := r.URL.Query().Get("admin_token")
			if !allowedTokens[tokenFromQuery] {
				sendError(w, http.StatusNotFound, "Локальный режим активен")
				return
			}
		}
	}

	switch r.Method {
	case http.MethodGet:
		if currentMode == "local" {
			// Проверяем админский токен
			adminToken := r.Header.Get("X-Admin-Token")
			allowedTokens := map[string]bool{"admin_local_token_123": true}
			
			if !allowedTokens[adminToken] {
				tokenFromQuery := r.URL.Query().Get("admin_token")
				if !allowedTokens[tokenFromQuery] {
					sendError(w, http.StatusNotFound, "Локальный режим активен")
					return
				}
			}
		}
		
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
		// Проверяем админский токен
		adminToken := r.Header.Get("X-Admin-Token")
		allowedTokens := map[string]bool{"admin_local_token_123": true}
		
		if !allowedTokens[adminToken] {
			tokenFromQuery := r.URL.Query().Get("admin_token")
			if !allowedTokens[tokenFromQuery] {
				stats["total_users"] = 0
				stats["message"] = "Локальный режим активен. Данные скрыты."
			}
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
		},
		"frontend": "https://dmitriy43229.github.io/Go-Project777_GoStory/",
	}
	
	// Для обычных пользователей в локальном режиме скрываем информацию
	if currentMode == "local" {
		adminToken := r.Header.Get("X-Admin-Token")
		allowedTokens := map[string]bool{"admin_local_token_123": true}
		
		if !allowedTokens[adminToken] {
			tokenFromQuery := r.URL.Query().Get("admin_token")
			if !allowedTokens[tokenFromQuery] {
				info["message"] = "Локальный режим активен"
				info["endpoints"] = map[string]string{
					"GET /api/mode": "Get current mode",
				}
			}
		}
	}
	
	sendJSON(w, http.StatusOK, info)
}

// Новые обработчики для управления режимом

func apiAdminModeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	// Проверяем админский пароль
	adminPassword := r.Header.Get("X-Admin-Password")
	if adminPassword != "admin123" {
		// Проверяем также в теле запроса
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			if body["password"] != "admin123" {
				sendError(w, http.StatusUnauthorized, "Invalid admin password")
				return
			}
		} else {
			sendError(w, http.StatusUnauthorized, "Invalid admin password")
			return
		}
	}
	
	// Получаем новый режим из запроса
	var request map[string]string
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	
	newMode := request["mode"]
	if newMode != "server" && newMode != "local" {
		sendError(w, http.StatusBadRequest, "Mode must be 'server' or 'local'")
		return
	}
	
	modeMutex.Lock()
	serverMode = newMode
	modeMutex.Unlock()
	
	fmt.Printf("🔧 Режим изменен на: %s\n", newMode)
	
	// Логируем изменение
	fmt.Printf("⏰ Время изменения: %s\n", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Printf("👥 Все пользователи теперь будут видеть режим: %s\n", newMode)
	
	sendJSON(w, http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Режим изменен на %s", newMode),
		"mode":    newMode,
		"time":    time.Now().Format("2006-01-02 15:04:05"),
	})
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
	http.HandleFunc("/", enableCORS(homeHandler))

	port := ":8068"
	fmt.Printf("🚀 Go API сервер запущен на порту %s\n", port)
	fmt.Printf("📊 База данных инициализирована с %d пользователями\n", len(db.users))
	fmt.Printf("🌐 Начальный режим: %s\n", serverMode)
	fmt.Println("🔧 Управление режимами:")
	fmt.Println("   POST /api/admin/mode - Изменить режим (требуется пароль admin123)")
	fmt.Println("   GET  /api/mode       - Получить текущий режим")
	fmt.Println("\n🔒 Локальный режим:")
	fmt.Println("   - Обычные пользователи получают 404 ошибку")
	fmt.Println("   - Белый экран с сообщением для не-админов")
	fmt.Println("   - Админский токен: admin_local_token_123")
	fmt.Println("\n🌐 API Endpoints:")
	fmt.Println("   GET  /api/users      - Все пользователи")
	fmt.Println("   POST /api/users      - Создать пользователя")
	fmt.Println("   GET  /api/users/{id} - Получить пользователя")
	fmt.Println("   PUT  /api/users/{id} - Обновить пользователя")
	fmt.Println("   DELETE /api/users/{id} - Удалить пользователя")
	fmt.Println("   GET  /api/stats      - Статистика сервера")
	fmt.Println("   GET  /api/info       - Информация об API")
	fmt.Println("\n🔗 Frontend доступен по адресу:")
	fmt.Println("   https://dmitriy43229.github.io/Go-Project777_GoStory/")

	log.Fatal(http.ListenAndServe(port, nil))
}