CREATE TABLE IF NOT EXISTS establishments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  meta TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_chat_id INTEGER UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT CHECK(role IN ('admin', 'manager', 'employee')) NOT NULL DEFAULT 'employee',
  manager_id INTEGER REFERENCES users(id),
  establishment_id INTEGER REFERENCES establishments(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  creator_user_id INTEGER REFERENCES users(id),
  assigned_user_id INTEGER REFERENCES users(id),
  establishment_id INTEGER REFERENCES establishments(id),
  due_date DATETIME,
  status TEXT CHECK(status IN ('pending', 'in_progress', 'questions', 'completed', 'cancelled')) DEFAULT 'pending',
  repeat_rule_json TEXT,
  original_task_id INTEGER REFERENCES tasks(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT,
  by_user_id INTEGER REFERENCES users(id),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id),
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_users_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,
  entity_id INTEGER,
  action TEXT,
  by_user_id INTEGER REFERENCES users(id),
  payload_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial data
INSERT OR IGNORE INTO users (telegram_chat_id, username, first_name, last_name, role)
VALUES (123456789, 'admin', 'Super', 'Admin', 'admin');

INSERT OR IGNORE INTO establishments (name, address) VALUES ('Demo Cafe', '123 Main St');

INSERT OR IGNORE INTO users (telegram_chat_id, username, first_name, last_name, role, establishment_id)
VALUES (987654321, 'manager', 'Ivan', 'Manager', 'manager', 1);

INSERT OR IGNORE INTO users (telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id)
VALUES (1122334455, 'employee', 'Petr', 'Employee', 'employee', 2, 1);
