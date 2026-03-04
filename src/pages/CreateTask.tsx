import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, Repeat } from 'lucide-react';
import { cn } from '../lib/utils';

export default function CreateTask() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_user_ids: [] as number[],
    due_date: '',
    repeat_rule: 'none'
  });

  useEffect(() => {
    fetch('/api/users').then(res => res.json()).then(setUsers);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.assigned_user_ids.length === 0) {
      alert('Выберите хотя бы одного сотрудника');
      return;
    }

    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          creator_user_id: user?.id,
          establishment_id: user?.establishment_id || 1, // Default for demo
          repeat_rule_json: formData.repeat_rule === 'none' ? null : JSON.stringify({ type: formData.repeat_rule })
        })
      });
      navigate('/tasks');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleUser = (id: number) => {
    setFormData(prev => ({
      ...prev,
      assigned_user_ids: prev.assigned_user_ids.includes(id)
        ? prev.assigned_user_ids.filter(uid => uid !== id)
        : [...prev.assigned_user_ids, id]
    }));
  };

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold mb-6">Новая задача</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Название</label>
          <input
            type="text"
            required
            className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Например: Уборка зала"
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Описание</label>
          <textarea
            className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            placeholder="Детали задачи..."
            value={formData.description}
            onChange={e => setFormData({...formData, description: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Users size={16} /> Исполнители
          </label>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {users.filter(u => u.role === 'employee').map(u => (
              <div 
                key={u.id}
                onClick={() => toggleUser(u.id)}
                className={cn(
                  "flex items-center p-3 border-b last:border-0 cursor-pointer transition-colors",
                  formData.assigned_user_ids.includes(u.id) ? "bg-blue-50" : "hover:bg-gray-50"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded border flex items-center justify-center mr-3 transition-colors",
                  formData.assigned_user_ids.includes(u.id) ? "bg-blue-500 border-blue-500" : "border-gray-300"
                )}>
                  {formData.assigned_user_ids.includes(u.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                <span>{u.first_name} {u.last_name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Calendar size={16} /> Дедлайн
            </label>
            <input
              type="datetime-local"
              required
              className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm"
              value={formData.due_date}
              onChange={e => setFormData({...formData, due_date: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Repeat size={16} /> Повтор
            </label>
            <select
              className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm appearance-none"
              value={formData.repeat_rule}
              onChange={e => setFormData({...formData, repeat_rule: e.target.value})}
            >
              <option value="none">Без повтора</option>
              <option value="daily">Ежедневно</option>
              <option value="weekly">Еженедельно</option>
              <option value="monthly">Ежемесячно</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-gray-200 active:scale-95 transition-transform mt-8"
        >
          Создать задачу
        </button>
      </form>
    </div>
  );
}
