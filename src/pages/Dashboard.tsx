import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, AlertCircle, BarChart3, Plus, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_URL } from "../config"


export default function Dashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ total: 0, completed: 0, overdue: 0 });

  useEffect(() => {
    fetch(`${API_URL}/api/stats`)
      .then(res => res.json())
      .then(setStats);
  }, []);

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Привет, {user?.first_name}!</h1>
          <p className="text-gray-500 text-sm capitalize">{user?.role === 'admin' ? 'Администратор' : user?.role === 'manager' ? 'Менеджер' : 'Сотрудник'}</p>
        </div>
        <button onClick={logout} className="p-2 text-gray-400 hover:text-red-500">
          <LogOut size={20} />
        </button>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Clock size={18} />
            <span className="font-medium text-sm">В работе</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.total - stats.completed - stats.overdue}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <AlertCircle size={18} />
            <span className="font-medium text-sm">Просрочено</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.overdue}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-2xl border border-green-100 col-span-2">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle2 size={18} />
            <span className="font-medium text-sm">Выполнено сегодня</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.completed}</div>
        </div>
      </div>

      {/* Quick Actions */}
      {(user?.role === 'admin' || user?.role === 'manager') && (
        <Link to="/create-task" className="flex items-center justify-center gap-2 w-full bg-black text-white py-4 rounded-xl font-medium shadow-lg shadow-gray-200 active:scale-95 transition-transform">
          <Plus size={20} />
          Создать задачу
        </Link>
      )}

      {/* Recent Activity / Tasks Preview */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">Мои задачи</h2>
          <Link to="/tasks" className="text-blue-600 text-sm font-medium">Все</Link>
        </div>
        
        {/* We'll load a few tasks here later */}
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Проверка оборудования</h3>
              <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full">В работе</span>
            </div>
            <p className="text-gray-500 text-sm line-clamp-2">Проверить кофемашину и холодильники на температурный режим.</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
              <Clock size={12} />
              <span>Сегодня, 14:00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
