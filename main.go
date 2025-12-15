package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
	"strings"
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
		// Разрешаем запросы с любых доменов
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next(w, r)
	}
}

// Add добавляет пользователя
func (db *InMemoryDB) Add(user User) User {
	db.mutex.Lock()
	defer db.mutex.Unlock()

	user.ID = db.nextID
	user.CreatedAt = time.Now()
	db.users[user.ID] = user
	db.nextID++
	return user
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
func (db *InMemoryDB) Update(user User) bool {
	db.mutex.Lock()
	defer db.mutex.Unlock()

	if existingUser, exists := db.users[user.ID]; exists {
		user.CreatedAt = existingUser.CreatedAt
		db.users[user.ID] = user
		return true
	}
	return false
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

// Обработчики HTTP
func homeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "UserManager Pro API",
		"version": "1.0.0",
		"docs":    "/api/info",
	})
}

func apiUsersHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		users := db.GetAll()
		json.NewEncoder(w).Encode(users)

	case "POST":
		var user User
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			http.Error(w, `{"error": "Invalid JSON"}`, http.StatusBadRequest)
			return
		}

		if user.Name == "" || user.Email == "" {
			http.Error(w, `{"error": "Name and email are required"}`, http.StatusBadRequest)
			return
		}

		newUser := db.Add(user)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(newUser)

	default:
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func apiUserHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Извлекаем ID из URL
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, `{"error": "Invalid URL"}`, http.StatusBadRequest)
		return
	}
	
	idStr := pathParts[3]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error": "Invalid user ID"}`, http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		user, exists := db.GetByID(id)
		if !exists {
			http.Error(w, `{"error": "User not found"}`, http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(user)

	case "PUT":
		var user User
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			http.Error(w, `{"error": "Invalid JSON"}`, http.StatusBadRequest)
			return
		}

		if user.Name == "" || user.Email == "" {
			http.Error(w, `{"error": "Name and email are required"}`, http.StatusBadRequest)
			return
		}

		user.ID = id
		if updated := db.Update(user); !updated {
			http.Error(w, `{"error": "User not found"}`, http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(user)

	case "DELETE":
		if deleted := db.Delete(id); !deleted {
			http.Error(w, `{"error": "User not found"}`, http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func apiStatsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	stats := map[string]interface{}{
		"total_users": len(db.users),
		"server_time": time.Now(),
		"status":      "online",
		"version":     "1.0.0",
		"go_version":  "1.23.1",
	}
	
	json.NewEncoder(w).Encode(stats)
}

func apiInfoHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	info := map[string]interface{}{
		"name":        "UserManager Pro API",
		"version":     "1.0.0",
		"description": "Go Backend API for UserManager Pro",
		"author":      "Dmitriy Kobelev",
		"endpoints": map[string]string{
			"GET /api/users": "Get all users",
			"POST /api/users": "Create user",
			"GET /api/users/{id}": "Get user by ID",
			"PUT /api/users/{id}": "Update user",
			"DELETE /api/users/{id}": "Delete user",
			"GET /api/stats": "Server statistics",
			"GET /api/info": "This info",
		},
		"frontend": "https://dmitriy43229.github.io/Go-Project777_GoStory/",
	}
	
	json.NewEncoder(w).Encode(info)
}

func main() {
	// Маршруты API с CORS
	http.HandleFunc("/api/users", enableCORS(apiUsersHandler))
	http.HandleFunc("/api/users/", enableCORS(apiUserHandler))
	http.HandleFunc("/api/stats", enableCORS(apiStatsHandler))
	http.HandleFunc("/api/info", enableCORS(apiInfoHandler))
	
	// Главная страница
	http.HandleFunc("/", enableCORS(homeHandler))

	port := ":8068"
	fmt.Printf("🚀 Go API сервер запущен на порту %s\n", port)
	fmt.Printf("📊 База данных инициализирована с %d пользователями\n", len(db.users))
	fmt.Println("🌐 API Endpoints:")
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