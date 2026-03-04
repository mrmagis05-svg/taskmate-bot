import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CheckCircle2, Circle, Clock, AlertCircle, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

interface Task {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'questions' | 'completed' | 'cancelled';
  due_date: string;
  assigned_first_name: string;
  assigned_last_name: string;
}

export default function Tasks({ filter }: { filter?: 'overdue' | 'all' }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'my' | 'pending' | 'completed'>('all');

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/tasks?user_id=${user.id}&role=${user.role}`);
      const data = await res.json();
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    try {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, user_id: user?.id })
      });
      fetchTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'overdue') {
      return new Date(task.due_date) < new Date() && task.status !== 'completed' && task.status !== 'cancelled';
    }
    
    if (activeFilter === 'my') return task.assigned_first_name === user?.first_name; // Simplified check
    if (activeFilter === 'pending') return task.status === 'pending' || task.status === 'in_progress';
    if (activeFilter === 'completed') return task.status === 'completed';
    
    return true;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="text-green-500" />;
      case 'in_progress': return <Clock className="text-blue-500" />;
      case 'questions': return <AlertCircle className="text-yellow-500" />;
      default: return <Circle className="text-gray-300" />;
    }
  };

  if (loading) return <div className="p-4 text-center text-gray-500">Загрузка задач...</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{filter === 'overdue' ? 'Просроченные' : 'Список задач'}</h1>
        {filter !== 'overdue' && (
          <button className="p-2 bg-white rounded-lg border border-gray-200 text-gray-500">
            <Filter size={20} />
          </button>
        )}
      </div>

      {filter !== 'overdue' && (
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['all', 'pending', 'completed'].map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f as any)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                activeFilter === f 
                  ? "bg-black text-white" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {f === 'all' ? 'Все' : f === 'pending' ? 'В работе' : 'Готовые'}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <CheckCircle2 size={48} className="mx-auto mb-2 opacity-20" />
            <p>Задач нет</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div key={task.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium text-gray-900">{task.title}</h3>
                <button onClick={() => handleStatusChange(task.id, task.status === 'completed' ? 'pending' : 'completed')}>
                  {getStatusIcon(task.status)}
                </button>
              </div>
              
              <p className="text-gray-500 text-sm mb-3 line-clamp-2">{task.description}</p>
              
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-gray-400">
                  <Clock size={12} />
                  <span className={cn(
                    new Date(task.due_date) < new Date() && task.status !== 'completed' ? "text-red-500 font-medium" : ""
                  )}>
                    {format(new Date(task.due_date), 'd MMM HH:mm', { locale: ru })}
                  </span>
                </div>
                
                <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md">
                  <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">
                    {task.assigned_first_name?.[0]}
                  </div>
                  <span className="text-gray-600">{task.assigned_first_name}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
