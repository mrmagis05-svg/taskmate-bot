import db from '../db/index.ts';
import { addDays, addWeeks, addMonths, parseISO, format } from 'date-fns';

export function runCron() {
  console.log('Running cron job...');
  const tasks = db.prepare("SELECT * FROM tasks WHERE repeat_rule_json IS NOT NULL AND status != 'cancelled'").all() as any[];
  
  let createdCount = 0;

  for (const task of tasks) {
    try {
      const rule = JSON.parse(task.repeat_rule_json);
      const lastRun = task.created_at; // Simplified: usually we track last generation date
      
      // Check if we need to generate a new task
      // This is a simplified logic for demo purposes. 
      // In production, we would check if a task for "today" or "tomorrow" already exists.
      
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
        const existing = db.prepare("SELECT id FROM tasks WHERE original_task_id = ? AND date(due_date) = date(?)").get(task.id, nextDate.toISOString());
        
        if (!existing) {
          db.prepare(`
            INSERT INTO tasks (title, description, creator_user_id, assigned_user_id, establishment_id, due_date, status, repeat_rule_json, original_task_id)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
          `).run(task.title, task.description, task.creator_user_id, task.assigned_user_id, task.establishment_id, nextDate.toISOString(), task.repeat_rule_json, task.id);
          createdCount++;
        }
      }
    } catch (e) {
      console.error(`Error processing task ${task.id}`, e);
    }
  }
  
  return { created: createdCount };
}
