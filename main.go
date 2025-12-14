package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"strconv"
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

func init() {
	db = &InMemoryDB{
		users:  make(map[int]User),
		nextID: 3,
	}
	// Начальные данные с датой создания
	now := time.Now()
	db.users[1] = User{ID: 1, Name: "Алексей Иванов", Email: "alex@example.com", CreatedAt: now.Add(-24 * time.Hour)}
	db.users[2] = User{ID: 2, Name: "Мария Петрова", Email: "maria@example.com", CreatedAt: now.Add(-12 * time.Hour)}
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

// GetByID возвращает пользователя по ID
func (db *InMemoryDB) GetByID(id int) (User, bool) {
	db.mutex.RLock()
	defer db.mutex.RUnlock()

	user, exists := db.users[id]
	return user, exists
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

// Update обновляет пользователя
func (db *InMemoryDB) Update(user User) bool {
	db.mutex.Lock()
	defer db.mutex.Unlock()

	if existingUser, exists := db.users[user.ID]; exists {
		user.CreatedAt = existingUser.CreatedAt // Сохраняем оригинальную дату создания
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
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	tmpl, err := template.ParseFiles("index.html")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	tmpl.Execute(w, nil)
}

func aboutHandler(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("about.html")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	tmpl.Execute(w, nil)
}

// Presentation page
func presentationHandler(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("presentation.html")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	tmpl.Execute(w, nil)
}

// API handlers
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

		// Валидация
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
	idStr := r.URL.Path[len("/api/users/"):]
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

		// Валидация
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

// Stats handler
func apiStatsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	stats := map[string]interface{}{
		"total_users": len(db.users),
		"server_time": time.Now(),
		"status":      "online",
		"version":     "1.0.0",
	}
	
	json.NewEncoder(w).Encode(stats)
}

func main() {
	// Статические файлы
	fs := http.FileServer(http.Dir("."))
	http.Handle("/static/", http.StripPrefix("/static/", fs))
	
	// Маршруты
	http.HandleFunc("/", homeHandler)
	http.HandleFunc("/about", aboutHandler)
	http.HandleFunc("/presentation", presentationHandler)
	http.HandleFunc("/api/users", apiUsersHandler)
	http.HandleFunc("/api/users/", apiUserHandler)
	http.HandleFunc("/api/stats", apiStatsHandler)

	port := ":8068"
	fmt.Printf("🚀 Сервер запущен на http://localhost%s\n", port)
	fmt.Printf("📊 База данных инициализирована с %d пользователями\n", len(db.users))
	fmt.Println("✨ Доступные эндпоинты:")
	fmt.Println("   - /                 - Главная страница")
	fmt.Println("   - /about            - О проекте")
	fmt.Println("   - /presentation     - Презентация проекта")
	fmt.Println("   - /api/users        - API пользователей")
	fmt.Println("   - /api/stats        - Статистика сервера")

	log.Fatal(http.ListenAndServe(port, nil))
}