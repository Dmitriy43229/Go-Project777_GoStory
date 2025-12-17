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

// Блокирующий middleware для локального режима
func blockLocalModeMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		modeMutex.RLock()
		currentMode := serverMode
		modeMutex.RUnlock()
		
		// Если режим локальный - блокируем ВСЕ запросы кроме /mode и /admin/mode
		if currentMode == "local" && 
		   !strings.Contains(r.URL.Path, "/mode") && 
		   !strings.Contains(r.URL.Path, "/admin/mode") {
			
			// Проверяем, может это админский запрос (с паролем)
			adminPassword := r.Header.Get("X-Admin-Password")
			if adminPassword == "admin123" {
				// Админ проходит
				next(w, r)
				return
			}
			
			// Для всех остальных - блокировка
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Локальный режим активен",
				"message": "Сайт временно недоступен. Администратор работает в локальном режиме.",
				"mode":    "local",
				"status":  "blocked",
			})
			return
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
		"version": "1.1.0",
		"mode":    currentMode,
		"status":  "online",
	})
}

func apiUsersHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		modeMutex.RLock()
		currentMode := serverMode
		modeMutex.RUnlock()
		
		if currentMode == "local" {
			// В локальном режиме возвращаем только для админа
			sendJSON(w, http.StatusOK, []User{})
			return
		}
		
		users := db.GetAll()
		sendJSON(w, http.StatusOK, users)

	case http.MethodPost:
		modeMutex.RLock()
		currentMode := serverMode
		modeMutex.RUnlock()
		
		if currentMode == "local" {
			sendError(w, http.StatusForbidden, "Локальный режим активен. Операция запрещена")
			return
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
	
	if currentMode == "local" && r.Method != http.MethodGet {
		sendError(w, http.StatusForbidden, "Локальный режим активен. Операция запрещена")
		return
	}
	
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

	switch r.Method {
	case http.MethodGet:
		if currentMode == "local" {
			sendJSON(w, http.StatusOK, User{})
			return
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
		"version":     "1.1.0",
		"mode":        currentMode,
	}
	
	// В локальном режиме показываем заблокированный статус
	if currentMode == "local" {
		stats["status"] = "local_blocked"
		stats["message"] = "Локальный режим активен"
		stats["total_users"] = 0
	} else {
		stats["status"] = "online"
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
		"version":     "1.1.0",
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
	sendJSON(w, http.StatusOK, info)
}

// Обработчики для управления режимом
func apiAdminModeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	
	// Проверяем админский пароль
	adminPassword := r.Header.Get("X-Admin-Password")
	if adminPassword != "admin123" {
		sendError(w, http.StatusUnauthorized, "Invalid admin password")
		return
	}
	
	// Получаем новый режим из тела запроса
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
	oldMode := serverMode
	serverMode = newMode
	modeMutex.Unlock()
	
	fmt.Printf("🔧 Режим изменен: %s → %s\n", oldMode, newMode)
	
	sendJSON(w, http.StatusOK, map[string]string{
		"message":   fmt.Sprintf("Режим изменен с %s на %s", oldMode, newMode),
		"old_mode":  oldMode,
		"new_mode":  newMode,
		"mode":      newMode,
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
	// Регистрация маршрутов с блокировкой
	http.HandleFunc("/api/users", enableCORS(blockLocalModeMiddleware(apiUsersHandler)))
	http.HandleFunc("/api/users/", enableCORS(blockLocalModeMiddleware(apiUserHandler)))
	http.HandleFunc("/api/stats", enableCORS(blockLocalModeMiddleware(apiStatsHandler)))
	http.HandleFunc("/api/info", enableCORS(blockLocalModeMiddleware(apiInfoHandler)))
	http.HandleFunc("/api/admin/mode", enableCORS(apiAdminModeHandler))
	http.HandleFunc("/api/mode", enableCORS(apiGetModeHandler))
	http.HandleFunc("/", enableCORS(blockLocalModeMiddleware(homeHandler)))

	port := ":8068"
	fmt.Printf("🚀 Go API сервер запущен на порту %s\n", port)
	fmt.Printf("📊 База данных инициализирована с %d пользователями\n", len(db.users))
	fmt.Printf("🌐 Начальный режим: %s\n", serverMode)
	fmt.Println("🔧 Управление режимами:")
	fmt.Println("   POST /api/admin/mode - Изменить режим (требуется пароль admin123)")
	fmt.Println("   GET  /api/mode       - Получить текущий режим")
	fmt.Println("\n🚫 В локальном режиме:")
	fmt.Println("   - Все API запросы блокируются для обычных пользователей")
	fmt.Println("   - Только администратор может получить доступ")
	fmt.Println("   - Фронтенд покажет страницу блокировки")

	log.Fatal(http.ListenAndServe(port, nil))
}