import express from "express";
import { createServer as createViteServer } from "vite";
import db from "./src/db/index.ts";
import { runCron } from './src/lib/cron.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // --- Users ---
  app.get("/api/users", (req, res) => {
    // In a real app, check auth here
    const users = db.prepare('SELECT * FROM users').all();
    res.json(users);
  });

  app.post("/api/users", (req, res) => {
    const { telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id } = req.body;
    try {
      const result = db.prepare(`
        INSERT INTO users (telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id);
      
      // Audit log
      db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`).run('user', result.lastInsertRowid, 'create', 1, JSON.stringify(req.body)); // Assuming admin id 1

      res.json({ id: result.lastInsertRowid });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Tasks ---
  app.get("/api/tasks", (req, res) => {
    const { user_id, role } = req.query;
    // Simple permission logic
    if (role === 'admin') {
      const tasks = db.prepare(`
        SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assigned_user_id = u.id
        ORDER BY t.due_date ASC
      `).all();
      res.json(tasks);
    } else if (role === 'manager') {
      // Manager sees tasks for their employees
      const tasks = db.prepare(`
        SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
        FROM tasks t
        JOIN users u ON t.assigned_user_id = u.id
        WHERE u.manager_id = ? OR t.creator_user_id = ?
        ORDER BY t.due_date ASC
      `).all(user_id, user_id);
      res.json(tasks);
    } else {
      // Employee sees their own tasks
      const tasks = db.prepare(`
        SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
        FROM tasks t
        LEFT JOIN users u ON t.assigned_user_id = u.id
        WHERE t.assigned_user_id = ?
        ORDER BY t.due_date ASC
      `).all(user_id);
      res.json(tasks);
    }
  });

  app.post("/api/tasks", (req, res) => {
    const { title, description, creator_user_id, assigned_user_ids, establishment_id, due_date, repeat_rule_json } = req.body;
    
    const insertTask = db.prepare(`
      INSERT INTO tasks (title, description, creator_user_id, assigned_user_id, establishment_id, due_date, status, repeat_rule_json)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    const createdIds = [];
    const transaction = db.transaction(() => {
      for (const assigned_id of assigned_user_ids) {
        const result = insertTask.run(title, description, creator_user_id, assigned_id, establishment_id, due_date, repeat_rule_json);
        createdIds.push(result.lastInsertRowid);
        
        // Audit
        db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`).run('task', result.lastInsertRowid, 'create', creator_user_id, JSON.stringify(req.body));
      }
    });

    try {
      transaction();
      res.json({ ids: createdIds });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/tasks/:id/status", (req, res) => {
    const { id } = req.params;
    const { status, user_id, comment } = req.body;
    
    try {
      const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as any;
      if (!task) return res.status(404).json({ error: "Task not found" });

      db.transaction(() => {
        db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
        db.prepare('INSERT INTO task_status_history (task_id, from_status, to_status, by_user_id, comment) VALUES (?, ?, ?, ?, ?)').run(id, task.status, status, user_id, comment || '');
        
        if (comment) {
           db.prepare('INSERT INTO task_comments (task_id, author_user_id, text) VALUES (?, ?, ?)').run(id, user_id, comment);
        }
      })();
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tasks/:id/comments", (req, res) => {
    const { id } = req.params;
    const comments = db.prepare(`
      SELECT c.*, u.first_name, u.last_name 
      FROM task_comments c
      JOIN users u ON c.author_user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(id);
    res.json(comments);
  });

  app.post("/api/tasks/:id/comments", (req, res) => {
    const { id } = req.params;
    const { user_id, text } = req.body;
    try {
      const result = db.prepare('INSERT INTO task_comments (task_id, author_user_id, text) VALUES (?, ?, ?)').run(id, user_id, text);
      res.json({ id: result.lastInsertRowid });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Establishments ---
  app.get("/api/establishments", (req, res) => {
    const establishments = db.prepare('SELECT * FROM establishments').all();
    res.json(establishments);
  });

  // --- Stats ---
  app.get("/api/stats", (req, res) => {
    // Simple stats aggregation
    const totalTasks = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as any;
    const completedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'").get() as any;
    const overdueTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE due_date < datetime('now') AND status != 'completed' AND status != 'cancelled'").get() as any;
    
    res.json({
      total: totalTasks.count,
      completed: completedTasks.count,
      overdue: overdueTasks.count
    });
  });

  // --- Telegram Webhook Simulation ---
  app.post("/webhook/telegram", (req, res) => {
    const update = req.body;
    console.log("Received Telegram Update:", JSON.stringify(update, null, 2));
    
    if (update.message) {
      const { chat, text, from } = update.message;
      
      // Cache user
      try {
        db.prepare(`
          INSERT OR IGNORE INTO telegram_users_cache (chat_id, username, first_name, last_name)
          VALUES (?, ?, ?, ?)
        `).run(chat.id, from.username, from.first_name, from.last_name);
      } catch (e) {
        console.error("Cache error", e);
      }

      // Handle commands
      if (text === '/start') {
        // In a real bot, we would send a message back using Telegram API
        console.log(`[BOT] Sending welcome message to ${chat.id}`);
      } else if (text === '/myid') {
        console.log(`[BOT] Your ID is ${chat.id}`);
      }
    }
    
    res.json({ ok: true });
  });

  app.get("/api/telegram/cache", (req, res) => {
    const users = db.prepare('SELECT * FROM telegram_users_cache ORDER BY created_at DESC').all();
    res.json(users);
  });

  // --- Cron Simulation ---
  app.post("/api/cron/run", (req, res) => {
    const result = runCron();
    res.json(result);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
