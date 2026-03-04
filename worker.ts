import { addDays, addWeeks, addMonths } from 'date-fns';

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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

      return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (e: any) {
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

// --- Handlers ---

async function handleApiRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  // --- Users ---
  if (path === "/api/users") {
    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM users").all();
      return Response.json(results);
    }
    if (request.method === "POST") {
      const body: any = await request.json();
      const { telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id } = body;
      
      const result = await env.DB.prepare(`
        INSERT INTO users (telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id).run();
      
      // Audit log
      await env.DB.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`)
        .bind('user', result.meta.last_row_id, 'create', 1, JSON.stringify(body)).run();

      return Response.json({ id: result.meta.last_row_id });
    }
  }

  // --- Tasks ---
  if (path === "/api/tasks") {
    if (request.method === "GET") {
      const user_id = url.searchParams.get("user_id");
      const role = url.searchParams.get("role");

      if (role === 'admin') {
        const { results } = await env.DB.prepare(`
          SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
          FROM tasks t 
          LEFT JOIN users u ON t.assigned_user_id = u.id
          ORDER BY t.due_date ASC
        `).all();
        return Response.json(results);
      } else if (role === 'manager') {
        const { results } = await env.DB.prepare(`
          SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
          FROM tasks t
          JOIN users u ON t.assigned_user_id = u.id
          WHERE u.manager_id = ? OR t.creator_user_id = ?
          ORDER BY t.due_date ASC
        `).bind(user_id, user_id).all();
        return Response.json(results);
      } else {
        const { results } = await env.DB.prepare(`
          SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
          FROM tasks t
          LEFT JOIN users u ON t.assigned_user_id = u.id
          WHERE t.assigned_user_id = ?
          ORDER BY t.due_date ASC
        `).bind(user_id).all();
        return Response.json(results);
      }
    }

    if (request.method === "POST") {
      const body: any = await request.json();
      const { title, description, creator_user_id, assigned_user_ids, establishment_id, due_date, repeat_rule_json } = body;
      
      const createdIds = [];
      const stmt = env.DB.prepare(`
        INSERT INTO tasks (title, description, creator_user_id, assigned_user_id, establishment_id, due_date, status, repeat_rule_json)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `);

      // D1 batching
      const batch = [];
      const auditBatch = [];

      for (const assigned_id of assigned_user_ids) {
        batch.push(stmt.bind(title, description, creator_user_id, assigned_id, establishment_id, due_date, repeat_rule_json));
      }
      
      const results = await env.DB.batch(batch);
      
      // Collect IDs and create audit logs
      for (const res of results) {
        createdIds.push(res.meta.last_row_id);
        auditBatch.push(env.DB.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`)
          .bind('task', res.meta.last_row_id, 'create', creator_user_id, JSON.stringify(body)));
      }
      
      await env.DB.batch(auditBatch);

      // Notify users via Telegram
      for (const assigned_id of assigned_user_ids) {
         const user: any = await env.DB.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").bind(assigned_id).first();
         if (user && user.telegram_chat_id) {
           await sendMessage(env.BOT_TOKEN, user.telegram_chat_id, `Новая задача: ${title}\n${description || ''}`);
         }
      }

      return Response.json({ ids: createdIds });
    }
  }

  // Task Status Update
  if (path.match(/\/api\/tasks\/\d+\/status/)) {
    const id = path.split('/')[3];
    const body: any = await request.json();
    const { status, user_id, comment } = body;

    const task: any = await env.DB.prepare('SELECT status, assigned_user_id, creator_user_id FROM tasks WHERE id = ?').bind(id).first();
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

    const batch = [
      env.DB.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, id),
      env.DB.prepare('INSERT INTO task_status_history (task_id, from_status, to_status, by_user_id, comment) VALUES (?, ?, ?, ?, ?)').bind(id, task.status, status, user_id, comment || '')
    ];

    if (comment) {
      batch.push(env.DB.prepare('INSERT INTO task_comments (task_id, author_user_id, text) VALUES (?, ?, ?)').bind(id, user_id, comment));
    }

    await env.DB.batch(batch);

    // Notify relevant parties
    // If employee updated, notify manager/creator
    if (user_id == task.assigned_user_id) {
       const creator: any = await env.DB.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").bind(task.creator_user_id).first();
       if (creator && creator.telegram_chat_id) {
         await sendMessage(env.BOT_TOKEN, creator.telegram_chat_id, `Статус задачи обновлен: ${status}\nЗадача #${id}`);
       }
    }

    return Response.json({ success: true });
  }

  // Task Comments
  if (path.match(/\/api\/tasks\/\d+\/comments/)) {
    const id = path.split('/')[3];
    if (request.method === "GET") {
      const { results } = await env.DB.prepare(`
        SELECT c.*, u.first_name, u.last_name 
        FROM task_comments c
        JOIN users u ON c.author_user_id = u.id
        WHERE c.task_id = ?
        ORDER BY c.created_at ASC
      `).bind(id).all();
      return Response.json(results);
    }
    if (request.method === "POST") {
      const body: any = await request.json();
      const { user_id, text } = body;
      const result = await env.DB.prepare('INSERT INTO task_comments (task_id, author_user_id, text) VALUES (?, ?, ?)').bind(id, user_id, text).run();
      return Response.json({ id: result.meta.last_row_id });
    }
  }

  // Establishments
  if (path === "/api/establishments") {
    const { results } = await env.DB.prepare('SELECT * FROM establishments').all();
    return Response.json(results);
  }

  // Stats
  if (path === "/api/stats") {
    const totalTasks: any = await env.DB.prepare('SELECT COUNT(*) as count FROM tasks').first();
    const completedTasks: any = await env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'").first();
    const overdueTasks: any = await env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE due_date < datetime('now') AND status != 'completed' AND status != 'cancelled'").first();
    
    return Response.json({
      total: totalTasks.count,
      completed: completedTasks.count,
      overdue: overdueTasks.count
    });
  }

  // Telegram Cache
  if (path === "/api/telegram/cache") {
    const { results } = await env.DB.prepare('SELECT * FROM telegram_users_cache ORDER BY created_at DESC').all();
    return Response.json(results);
  }

  // Manual Cron Trigger
  if (path === "/api/cron/run" && request.method === "POST") {
    const result = await runCron(env);
    return Response.json(result);
  }

  return new Response("Not found", { status: 404 });
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const update: any = await request.json();
  console.log("Received Telegram Update:", JSON.stringify(update, null, 2));
  
  if (update.message) {
    const { chat, text, from } = update.message;
    
    // Cache user
    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO telegram_users_cache (chat_id, username, first_name, last_name)
        VALUES (?, ?, ?, ?)
      `).bind(chat.id, from.username, from.first_name, from.last_name).run();
    } catch (e) {
      console.error("Cache error", e);
    }

    // Handle commands
    if (text === '/start') {
      await sendMessage(env.BOT_TOKEN, chat.id, `Добро пожаловать! Ваш ID: ${chat.id}. Ожидайте, пока администратор добавит вас в систему.`);
    } else if (text === '/myid') {
      await sendMessage(env.BOT_TOKEN, chat.id, `Ваш ID: ${chat.id}`);
    }
  }
  
  return Response.json({ ok: true });
}

async function runCron(env: Env) {
  console.log('Running cron job...');
  const { results: tasks } = await env.DB.prepare("SELECT * FROM tasks WHERE repeat_rule_json IS NOT NULL AND status != 'cancelled'").all();
  
  let createdCount = 0;

  for (const task of tasks as any[]) {
    try {
      const rule = JSON.parse(task.repeat_rule_json);
      
      let nextDate: Date | null = null;
      const dueDate = new Date(task.due_date);

      if (rule.type === 'daily') {
        nextDate = addDays(dueDate, 1);
      } else if (rule.type === 'weekly') {
        nextDate = addWeeks(dueDate, 1);
      } else if (rule.type === 'monthly') {
        nextDate = addMonths(dueDate, 1);
      }

      if (nextDate) {
        // Check if duplicate exists
        const existing = await env.DB.prepare("SELECT id FROM tasks WHERE original_task_id = ? AND date(due_date) = date(?)").bind(task.id, nextDate.toISOString()).first();
        
        if (!existing) {
          await env.DB.prepare(`
            INSERT INTO tasks (title, description, creator_user_id, assigned_user_id, establishment_id, due_date, status, repeat_rule_json, original_task_id)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
          `).bind(task.title, task.description, task.creator_user_id, task.assigned_user_id, task.establishment_id, nextDate.toISOString(), task.repeat_rule_json, task.id).run();
          createdCount++;
        }
      }
    } catch (e) {
      console.error(`Error processing task ${task.id}`, e);
    }
  }
  
  return { created: createdCount };
}

async function sendMessage(token: string, chatId: number, text: string) {
  if (!token) {
    console.log(`[MOCK TELEGRAM] To ${chatId}: ${text}`);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    });
  } catch (e) {
    console.error("Telegram send error", e);
  }
}
