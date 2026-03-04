import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertCircle, Clock } from 'lucide-react';
import { API_URL } from '../config';

export default function Overdue() {
  const { user, getAuthHeaders } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks/overdue`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-4">Загрузка...</div>;

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-red-600">
        <AlertCircle /> Просроченные задачи
      </h1>

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            Нет просроченных задач! 🎉
          </div>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg">{task.title}</h3>
                <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg text-xs font-medium">
                  {task.status}
                </span>
              </div>
              <p className="text-gray-600 text-sm mb-3 line-clamp-2">{task.description}</p>
              
              <div className="flex items-center justify-between text-xs text-gray-500 mt-4 pt-3 border-t border-gray-50">
                <div className="flex items-center gap-1 text-red-600 font-medium">
                  <Clock size={14} />
                  {format(new Date(task.due_date), 'd MMM HH:mm', { locale: ru })}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold">
                    {task.assigned_first_name?.[0]}{task.assigned_last_name?.[0]}
                  </div>
                  {user?.role !== 'employee' && task.manager_name && (
                     <span className="text-gray-400">Менеджер: {task.manager_name}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
