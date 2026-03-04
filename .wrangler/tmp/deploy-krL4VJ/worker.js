var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/date-fns/constants.js
var daysInYear = 365.2425;
var maxTime = Math.pow(10, 8) * 24 * 60 * 60 * 1e3;
var minTime = -maxTime;
var secondsInHour = 3600;
var secondsInDay = secondsInHour * 24;
var secondsInWeek = secondsInDay * 7;
var secondsInYear = secondsInDay * daysInYear;
var secondsInMonth = secondsInYear / 12;
var secondsInQuarter = secondsInMonth * 3;
var constructFromSymbol = /* @__PURE__ */ Symbol.for("constructDateFrom");

// node_modules/date-fns/constructFrom.js
function constructFrom(date, value) {
  if (typeof date === "function") return date(value);
  if (date && typeof date === "object" && constructFromSymbol in date)
    return date[constructFromSymbol](value);
  if (date instanceof Date) return new date.constructor(value);
  return new Date(value);
}
__name(constructFrom, "constructFrom");

// node_modules/date-fns/toDate.js
function toDate(argument, context) {
  return constructFrom(context || argument, argument);
}
__name(toDate, "toDate");

// node_modules/date-fns/addDays.js
function addDays(date, amount, options) {
  const _date = toDate(date, options?.in);
  if (isNaN(amount)) return constructFrom(options?.in || date, NaN);
  if (!amount) return _date;
  _date.setDate(_date.getDate() + amount);
  return _date;
}
__name(addDays, "addDays");

// node_modules/date-fns/addMonths.js
function addMonths(date, amount, options) {
  const _date = toDate(date, options?.in);
  if (isNaN(amount)) return constructFrom(options?.in || date, NaN);
  if (!amount) {
    return _date;
  }
  const dayOfMonth = _date.getDate();
  const endOfDesiredMonth = constructFrom(options?.in || date, _date.getTime());
  endOfDesiredMonth.setMonth(_date.getMonth() + amount + 1, 0);
  const daysInMonth = endOfDesiredMonth.getDate();
  if (dayOfMonth >= daysInMonth) {
    return endOfDesiredMonth;
  } else {
    _date.setFullYear(
      endOfDesiredMonth.getFullYear(),
      endOfDesiredMonth.getMonth(),
      dayOfMonth
    );
    return _date;
  }
}
__name(addMonths, "addMonths");

// node_modules/date-fns/addWeeks.js
function addWeeks(date, amount, options) {
  return addDays(date, amount * 7, options);
}
__name(addWeeks, "addWeeks");

// worker.ts
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
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
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      }
      return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  },
  async scheduled(event, env, ctx) {
    await runCron(env);
  }
};
async function handleApiRequest(request, env, url) {
  const path = url.pathname;
  if (path === "/api/users") {
    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM users").all();
      return Response.json(results);
    }
    if (request.method === "POST") {
      const body = await request.json();
      const { telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id } = body;
      const result = await env.DB.prepare(`
        INSERT INTO users (telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(telegram_chat_id, username, first_name, last_name, role, manager_id, establishment_id).run();
      await env.DB.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`).bind("user", result.meta.last_row_id, "create", 1, JSON.stringify(body)).run();
      return Response.json({ id: result.meta.last_row_id });
    }
  }
  if (path === "/api/tasks") {
    if (request.method === "GET") {
      const user_id = url.searchParams.get("user_id");
      const role = url.searchParams.get("role");
      if (role === "admin") {
        const { results } = await env.DB.prepare(`
          SELECT t.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name 
          FROM tasks t 
          LEFT JOIN users u ON t.assigned_user_id = u.id
          ORDER BY t.due_date ASC
        `).all();
        return Response.json(results);
      } else if (role === "manager") {
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
      const body = await request.json();
      const { title, description, creator_user_id, assigned_user_ids, establishment_id, due_date, repeat_rule_json } = body;
      const createdIds = [];
      const stmt = env.DB.prepare(`
        INSERT INTO tasks (title, description, creator_user_id, assigned_user_id, establishment_id, due_date, status, repeat_rule_json)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `);
      const batch = [];
      const auditBatch = [];
      for (const assigned_id of assigned_user_ids) {
        batch.push(stmt.bind(title, description, creator_user_id, assigned_id, establishment_id, due_date, repeat_rule_json));
      }
      const results = await env.DB.batch(batch);
      for (const res of results) {
        createdIds.push(res.meta.last_row_id);
        auditBatch.push(env.DB.prepare(`INSERT INTO audit_log (entity_type, entity_id, action, by_user_id, payload_json) VALUES (?, ?, ?, ?, ?)`).bind("task", res.meta.last_row_id, "create", creator_user_id, JSON.stringify(body)));
      }
      await env.DB.batch(auditBatch);
      for (const assigned_id of assigned_user_ids) {
        const user = await env.DB.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").bind(assigned_id).first();
        if (user && user.telegram_chat_id) {
          await sendMessage(env.BOT_TOKEN, user.telegram_chat_id, `\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430: ${title}
${description || ""}`);
        }
      }
      return Response.json({ ids: createdIds });
    }
  }
  if (path.match(/\/api\/tasks\/\d+\/status/)) {
    const id = path.split("/")[3];
    const body = await request.json();
    const { status, user_id, comment } = body;
    const task = await env.DB.prepare("SELECT status, assigned_user_id, creator_user_id FROM tasks WHERE id = ?").bind(id).first();
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
    const batch = [
      env.DB.prepare("UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id),
      env.DB.prepare("INSERT INTO task_status_history (task_id, from_status, to_status, by_user_id, comment) VALUES (?, ?, ?, ?, ?)").bind(id, task.status, status, user_id, comment || "")
    ];
    if (comment) {
      batch.push(env.DB.prepare("INSERT INTO task_comments (task_id, author_user_id, text) VALUES (?, ?, ?)").bind(id, user_id, comment));
    }
    await env.DB.batch(batch);
    if (user_id == task.assigned_user_id) {
      const creator = await env.DB.prepare("SELECT telegram_chat_id FROM users WHERE id = ?").bind(task.creator_user_id).first();
      if (creator && creator.telegram_chat_id) {
        await sendMessage(env.BOT_TOKEN, creator.telegram_chat_id, `\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u0434\u0430\u0447\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D: ${status}
\u0417\u0430\u0434\u0430\u0447\u0430 #${id}`);
      }
    }
    return Response.json({ success: true });
  }
  if (path.match(/\/api\/tasks\/\d+\/comments/)) {
    const id = path.split("/")[3];
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
      const body = await request.json();
      const { user_id, text } = body;
      const result = await env.DB.prepare("INSERT INTO task_comments (task_id, author_user_id, text) VALUES (?, ?, ?)").bind(id, user_id, text).run();
      return Response.json({ id: result.meta.last_row_id });
    }
  }
  if (path === "/api/establishments") {
    const { results } = await env.DB.prepare("SELECT * FROM establishments").all();
    return Response.json(results);
  }
  if (path === "/api/stats") {
    const totalTasks = await env.DB.prepare("SELECT COUNT(*) as count FROM tasks").first();
    const completedTasks = await env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed'").first();
    const overdueTasks = await env.DB.prepare("SELECT COUNT(*) as count FROM tasks WHERE due_date < datetime('now') AND status != 'completed' AND status != 'cancelled'").first();
    return Response.json({
      total: totalTasks.count,
      completed: completedTasks.count,
      overdue: overdueTasks.count
    });
  }
  if (path === "/api/telegram/cache") {
    const { results } = await env.DB.prepare("SELECT * FROM telegram_users_cache ORDER BY created_at DESC").all();
    return Response.json(results);
  }
  if (path === "/api/cron/run" && request.method === "POST") {
    const result = await runCron(env);
    return Response.json(result);
  }
  return new Response("Not found", { status: 404 });
}
__name(handleApiRequest, "handleApiRequest");
async function handleTelegramWebhook(request, env) {
  const update = await request.json();
  console.log("Received Telegram Update:", JSON.stringify(update, null, 2));
  if (update.message) {
    const { chat, text, from } = update.message;
    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO telegram_users_cache (chat_id, username, first_name, last_name)
        VALUES (?, ?, ?, ?)
      `).bind(chat.id, from.username, from.first_name, from.last_name).run();
    } catch (e) {
      console.error("Cache error", e);
    }
    if (text === "/start") {
      await sendMessage(env.BOT_TOKEN, chat.id, `\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C! \u0412\u0430\u0448 ID: ${chat.id}. \u041E\u0436\u0438\u0434\u0430\u0439\u0442\u0435, \u043F\u043E\u043A\u0430 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 \u0434\u043E\u0431\u0430\u0432\u0438\u0442 \u0432\u0430\u0441 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0443.`);
    } else if (text === "/myid") {
      await sendMessage(env.BOT_TOKEN, chat.id, `\u0412\u0430\u0448 ID: ${chat.id}`);
    }
  }
  return Response.json({ ok: true });
}
__name(handleTelegramWebhook, "handleTelegramWebhook");
async function runCron(env) {
  console.log("Running cron job...");
  const { results: tasks } = await env.DB.prepare("SELECT * FROM tasks WHERE repeat_rule_json IS NOT NULL AND status != 'cancelled'").all();
  let createdCount = 0;
  for (const task of tasks) {
    try {
      const rule = JSON.parse(task.repeat_rule_json);
      let nextDate = null;
      const dueDate = new Date(task.due_date);
      if (rule.type === "daily") {
        nextDate = addDays(dueDate, 1);
      } else if (rule.type === "weekly") {
        nextDate = addWeeks(dueDate, 1);
      } else if (rule.type === "monthly") {
        nextDate = addMonths(dueDate, 1);
      }
      if (nextDate) {
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
__name(runCron, "runCron");
async function sendMessage(token, chatId, text) {
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
__name(sendMessage, "sendMessage");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
