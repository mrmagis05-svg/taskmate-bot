import { addDays, addWeeks, addMonths, isSameDay } from 'date-fns';
import { D1 } from './src/lib/d1';

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  ADMIN_CHAT_ID?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // Change to specific origin in production if needed
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-chat-id, x-dev-user-id",
      "Access-Control-Allow-Credentials": "true",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (request.method === "POST" && url.pathname === "/webhook/telegram") {
        return handleTelegramWebhook(request, env);
      }

      if (url.pathname.startsWith("/api/")) {
        const response = await handleApiRequest(request, env, url);
        // Add CORS headers to API responses
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      }
      
      if (url.pathname === "/admin/run-repeat" && request.method === "POST") {
          // Basic protection for manual trigger
          const chatId = request.headers.get("x-chat-id");
          if (chatId !== env.ADMIN_CHAT_ID && !url.searchParams.has("force")) { // Allow force param for dev
             // return new Response("Unauthorized", { status: 401 });
          }
          const result = await runCron(env);
          return Response.json(result, { headers: corsHeaders });
      }

      return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (e: any) {
      console.error("Worker Error:", e);
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        } 
      });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await runCron(env);
  },
};

// --- Middleware ---

async function authFromChatId(request: Request, env: Env): Promise<any> {
  const db = new D1(env.DB);
  let chatId = request.headers.get("x-chat-id");
  const devUserId = request.headers.get("x-dev-user-id");

  if (devUserId) {
    // Dev mode authentication
    const user = await db.first("SELECT * FROM users WHERE id = ?", devUserId);
    if (user) return user;
  }

  if (chatId) {
    const user = await db.first("SELECT * FROM users WHERE telegram_chat_id = ?", chatId);
    if (user) return user;
  }

  return null;
}

// --- Handlers ---

async function handleApiRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const db = new D1(env.DB);
  const user = await authFromChatId(request, env);

  if (!user && !path.startsWith("/api/telegram/cache")) { // Allow cache access for dev setup or public if needed? No, usually protected.
      // For the purpose of this demo, we might be lenient, but specs say "Worker checks x-chat-id".
      // If no user found, return 401.
      // Exception: maybe /api/users for initial setup if no users exist?
      // Let's enforce auth strictly except for specific cases if needed.
      return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Users ---
  if (path === "/api/users") {
    if (request.method === "GET") {
      const role = url.searchParams.get("role");
      const establishment_id = url.searchParams.get("establishment_id");
      
      let query = "SELECT * FROM users WHERE 1=1";
      const params = [];

      if (role) {
        query += " AND role = ?";
        params.push(role);
      }
      if (establishment_id) {
        query += " AND establishment_id = ?";
        params.push(establishment_id);
      }
      
      // Manager can only see their employees (or everyone? Specs: "Manager — имеет доступ только к своим подчинённым")
      if (user.role === 'manager') {
         query += " AND (manager_id = ? OR id = ?)";
         params.push(user.id, user.id);
      } else if (user.role === 'employee') {
         // Employee sees themselves?
         query += " AND id = ?";
         params.push(user.id);
      }

      const users = await db.query(query, ...params);
      return Response.json(users);
    }

    if (request.method === "POST") {
      if (user.role !== 'admin') return Response.json({ error: "Forbidden" }, { status: 403 });

      const body: any = await request.json();
      const { telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id } = body;
      
      const result = await db.run(`
        INSERT INTO users (telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id);
      
      await logAudit(db, 'user', result.meta.last_row_id, 'create', user.id, body);

      return Response.json({ id: result.meta.last_row_id }, { status: 201 });
    }
  }

  // --- Tasks ---
  if (path === "/api/tasks") {
    if (request.method === "GET") {
      const status = url.searchParams.get("status");
      const overdue = url.searchParams.get("overdue") === 'true';
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      let query = `
        SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assigned_user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      // Role-based filtering
      if (user.role === 'admin') {
        // All tasks
      } else if (user.role === 'manager') {
        // Tasks created by manager OR assigned to their subordinates
        query += " AND (t.creator_user_id = ? OR u.manager_id = ?)";
        params.push(user.id, user.id);
      } else {
        // Employee: only assigned tasks
        query += " AND t.assigned_user_id = ?";
        params.push(user.id);
      }

      if (status) {
        query += " AND t.status = ?";
        params.push(status);
      }

      if (overdue) {
        query += " AND t.due_date < datetime('now') AND t.status NOT IN ('completed', 'cancelled')";
      }

      if (from) {
        query += " AND t.due_date >= ?";
        params.push(from);
      }
      if (to) {
        query += " AND t.due_date <= ?";
        params.push(to);
      }

      query += " ORDER BY t.due_date ASC";

      const tasks = await db.query(query, ...params);
      return Response.json(tasks);
    }

    if (request.method === "POST") {
      if (user.role === 'employee') return Response.json({ error: "Forbidden" }, { status: 403 });

      const body: any = await request.json();
      const { title, description, creator_user_id, assigned_user_ids, establishment_id, due_date, repeat_rule_json, priority } = body;
      
      const createdIds = [];
      const stmt = env.DB.prepare(`
        INSERT INTO tasks (title, description, creator_user_id, assigned_user_id, establishment_id, due_date, status, repeat_rule_json, priority)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `);

      const batch = [];
      
      // Ensure assigned_user_ids is array
      const assignees = Array.isArray(assigned_user_ids) ? assigned_user_ids : [assigned_user_ids];

      for (const assigned_id of assignees) {
        batch.push(stmt.bind(title, description, user.id, assigned_id, establishment_id, due_date, repeat_rule_json, priority || 'normal'));
      }
      
      const results = await db.batch(batch);
      
      // Audit and Notify
      const auditBatch = [];
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.success) {
            const taskId = res.meta.last_row_id;
            createdIds.push(taskId);
            auditBatch.push(env.DB.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`)
            .bind('task', taskId, 'create', user.id, JSON.stringify(body)));
            
            // Notify
            const assignedId = assignees[i];
            const assignee = await db.first("SELECT telegram_chat_id FROM users WHERE id = ?", assignedId);
            if (assignee?.telegram_chat_id) {
                await sendMessage(env.BOT_TOKEN, assignee.telegram_chat_id, `🆕 Новая задача: ${title}\n📅 Срок: ${new Date(due_date).toLocaleString('ru-RU')}\n${description || ''}`);
            }
        }
      }
      
      if (auditBatch.length > 0) await env.DB.batch(auditBatch);

      return Response.json({ ids: createdIds }, { status: 201 });
    }
  }

  // Task Status Update
  if (path.match(/\/api\/tasks\/\d+\/status/)) {
    const id = parseInt(path.split('/')[3]);
    const body: any = await request.json();
    const { to_status, comment } = body;

    const task: any = await db.first('SELECT * FROM tasks WHERE id = ?', id);
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

    // Permission check
    if (user.role === 'employee' && task.assigned_user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (user.role === 'manager') {
        const assignee = await db.first("SELECT manager_id FROM users WHERE id = ?", task.assigned_user_id);
        if (assignee?.manager_id !== user.id && task.creator_user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const batch = [
      env.DB.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(to_status, id),
      env.DB.prepare('INSERT INTO task_status_history (task_id, from_status, to_status, by_user_id, comment) VALUES (?, ?, ?, ?, ?)').bind(id, task.status, to_status, user.id, comment || '')
    ];

    await db.batch(batch);
    await logAudit(db, 'task', id, 'status_change', user.id, { from: task.status, to: to_status, comment });

    // Notifications
    const notifyIds = new Set<number>();
    if (task.creator_user_id && task.creator_user_id !== user.id) notifyIds.add(task.creator_user_id);
    // If employee updated, notify manager
    if (user.role === 'employee') {
        const assignee = await db.first("SELECT manager_id FROM users WHERE id = ?", user.id);
        if (assignee?.manager_id) notifyIds.add(assignee.manager_id);
    }

    for (const uid of notifyIds) {
        const u = await db.first("SELECT telegram_chat_id FROM users WHERE id = ?", uid);
        if (u?.telegram_chat_id) {
            await sendMessage(env.BOT_TOKEN, u.telegram_chat_id, `🔄 Статус задачи обновлен: ${to_status}\nЗадача: ${task.title}\nКем: ${user.first_name} ${user.last_name}`);
        }
    }

    return Response.json({ success: true });
  }

  // Task Comments
  if (path.match(/\/api\/tasks\/\d+\/comments/)) {
    const id = parseInt(path.split('/')[3]);
    if (request.method === "GET") {
      const comments = await db.query(`
        SELECT c.*, u.first_name, u.last_name 
        FROM task_comments c
        JOIN users u ON c.author_user_id = u.id
        WHERE c.task_id = ?
        ORDER BY c.created_at ASC
      `, id);
      return Response.json(comments);
    }
    if (request.method === "POST") {
      const body: any = await request.json();
      const { text } = body;
      const result = await db.run('INSERT INTO task_comments (task_id, author_user_id, text) VALUES (?, ?, ?)', id, user.id, text);
      
      // Notify
      const task = await db.first("SELECT * FROM tasks WHERE id = ?", id);
      if (task) {
          const notifyIds = new Set<number>();
          if (task.assigned_user_id !== user.id) notifyIds.add(task.assigned_user_id);
          if (task.creator_user_id !== user.id) notifyIds.add(task.creator_user_id);
          
          for (const uid of notifyIds) {
             const u = await db.first("SELECT telegram_chat_id FROM users WHERE id = ?", uid);
             if (u?.telegram_chat_id) {
                 await sendMessage(env.BOT_TOKEN, u.telegram_chat_id, `💬 Новый комментарий к задаче: ${task.title}\n${user.first_name}: ${text}`);
             }
          }
      }

      return Response.json({ id: result.meta.last_row_id }, { status: 201 });
    }
  }

  // Overdue
  if (path === "/api/tasks/overdue") {
      const overdueTasks = await db.query(`
        SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name, m.first_name as manager_name
        FROM tasks t
        JOIN users u ON t.assigned_user_id = u.id
        LEFT JOIN users m ON u.manager_id = m.id
        WHERE t.due_date < datetime('now') AND t.status NOT IN ('completed', 'cancelled')
      `);
      return Response.json(overdueTasks);
  }

  // Establishments
  if (path === "/api/establishments") {
    const results = await db.query('SELECT * FROM establishments');
    return Response.json(results);
  }

  // Stats
  if (path.startsWith("/api/stats")) {
    if (user.role !== 'admin' && user.role !== 'manager') return Response.json({ error: "Forbidden" }, { status: 403 });
    
    // General stats
    if (path === "/api/stats") {
        const totalTasks = await db.first('SELECT COUNT(*) as count FROM tasks');
        const completedTasks = await db.first("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'");
        const overdueTasks = await db.first("SELECT COUNT(*) as count FROM tasks WHERE due_date < datetime('now') AND status != 'completed' AND status != 'cancelled'");
        
        return Response.json({
          total: totalTasks.count,
          completed: completedTasks.count,
          overdue: overdueTasks.count
        });
    }
    
    // Manager stats
    if (path.match(/\/api\/stats\/manager\/\d+/)) {
        const managerId = path.split('/').pop();
        // Implement specific stats logic here
        return Response.json({ todo: "Implement manager stats" });
    }
  }

  // Telegram Cache
  if (path === "/api/telegram/cache") {
    if (user.role !== 'admin') return Response.json({ error: "Forbidden" }, { status: 403 });
    const results = await db.query('SELECT * FROM telegram_users_cache ORDER BY created_at DESC');
    return Response.json(results);
  }

  return new Response("Not found", { status: 404 });
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const update: any = await request.json();
  const db = new D1(env.DB);
  
  if (update.message) {
    const { chat, text, from } = update.message;
    
    // Cache user
    try {
      await db.run(`
        INSERT INTO telegram_users_cache (chat_id, username, first_name, last_name, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id) DO UPDATE SET
          username = excluded.username,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          created_at = CURRENT_TIMESTAMP
      `, chat.id, from.username, from.first_name, from.last_name);
    } catch (e) {
      console.error("Cache error", e);
    }

    // Handle commands
    if (text === '/start') {
      await sendMessage(env.BOT_TOKEN, chat.id, `Добро пожаловать! Ваш ID: ${chat.id}. Ожидайте, пока администратор добавит вас в систему.`);
    } else if (text === '/myid') {
      await sendMessage(env.BOT_TOKEN, chat.id, `Ваш ID: ${chat.id}`);
    } else if (text && text.startsWith('/getid')) {
        const username = text.split(' ')[1];
        if (username) {
            const cleanUsername = username.replace('@', '');
            const cached = await db.first("SELECT chat_id FROM telegram_users_cache WHERE username = ?", cleanUsername);
            if (cached) {
                await sendMessage(env.BOT_TOKEN, chat.id, `ID пользователя @${cleanUsername}: ${cached.chat_id}`);
            } else {
                await sendMessage(env.BOT_TOKEN, chat.id, `Пользователь @${cleanUsername} не найден в кэше.`);
            }
        }
    }
  }
  
  return Response.json({ ok: true });
}

async function runCron(env: Env) {
  console.log('Running cron job...');
  const db = new D1(env.DB);
  // Only process master tasks (templates) that are not cancelled
  const tasks = await db.query("SELECT * FROM tasks WHERE repeat_rule_json IS NOT NULL AND original_task_id IS NULL AND status != 'cancelled'");
  
  let createdCount = 0;

  for (const task of tasks) {
    try {
      const rule = JSON.parse(task.repeat_rule_json);
      
      let nextDate: Date | null = null;
      // Calculate next date based on the *master* task's due date or the last generated task's date?
      // For simplicity, let's assume master task due_date is the "start date".
      // We need to find the *latest* instance to calculate the next one.
      
      const lastInstance = await db.first("SELECT due_date FROM tasks WHERE original_task_id = ? ORDER BY due_date DESC LIMIT 1", task.id);
      const baseDate = lastInstance ? new Date(lastInstance.due_date) : new Date(task.due_date);
      
      if (rule.type === 'daily') {
        nextDate = addDays(baseDate, 1);
      } else if (rule.type === 'weekly') {
        nextDate = addWeeks(baseDate, 1);
      } else if (rule.type === 'monthly') {
        nextDate = addMonths(baseDate, 1);
      }

      const now = new Date();
      // Only generate if nextDate is due (or close to due)
      // For demo purposes, we generate if it's in the future but not too far? 
      // Or just generate the next one regardless if it doesn't exist.
      
      if (nextDate) {
         // Check if duplicate exists for this date
         const existing = await db.first("SELECT id FROM tasks WHERE original_task_id = ? AND date(due_date) = date(?)", task.id, nextDate.toISOString());
         
         if (!existing) {
             // Create new task instance
             // Do NOT copy repeat_rule_json to child, so it doesn't become a generator itself
             await db.run(`
                INSERT INTO tasks (title, description, creator_user_id, assigned_user_id, establishment_id, due_date, status, repeat_rule_json, original_task_id, priority)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
             `, task.title, task.description, task.creator_user_id, task.assigned_user_id, task.establishment_id, nextDate.toISOString(), task.id, task.priority);
             
             createdCount++;
             
             // Notify
             const assignee = await db.first("SELECT telegram_chat_id FROM users WHERE id = ?", task.assigned_user_id);
             if (assignee?.telegram_chat_id) {
                 await sendMessage(env.BOT_TOKEN, assignee.telegram_chat_id, `🔄 Повторяющаяся задача: ${task.title}\n📅 Срок: ${nextDate.toLocaleString('ru-RU')}`);
             }
         }
      }

    } catch (e) {
      console.error(`Error processing task ${task.id}`, e);
    }
  }
  
  return { created: createdCount };
}

async function logAudit(db: D1, entityType: string, entityId: number, action: string, userId: number, payload: any) {
    try {
        await db.run(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`,
            entityType, entityId, action, userId, JSON.stringify(payload));
    } catch (e) {
        console.error("Audit Log Error", e);
    }
}

// Rate limiting queue could be implemented here using Durable Objects or simple delay
async function sendMessage(token: string, chatId: number, text: string) {
  if (!token) {
    console.log(`[MOCK TELEGRAM] To ${chatId}: ${text}`);
    return;
  }
  try {
    // Simple throttling
    await new Promise(r => setTimeout(r, 200)); 
    
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    });
    if (!res.ok) {
        const err = await res.text();
        console.error("Telegram API Error:", err);
    }
  } catch (e) {
    console.error("Telegram send error", e);
  }
}
