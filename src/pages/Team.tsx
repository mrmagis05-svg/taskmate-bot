import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Search } from 'lucide-react';
import { API_URL } from "../config"

export default function Team() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [cachedUsers, setCachedUsers] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/users`).then(res => res.json()).then(setUsers);
    if (user?.role === 'admin') {
      fetch(`${API_URL}/api/telegram/cache`).then(res => res.json()).then(setCachedUsers);
    }
  }, [user]);

  const handleCreateUser = async (cachedUser: any, role: string) => {
    try {
      await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_chat_id: cachedUser.chat_id,
          username: cachedUser.username,
          first_name: cachedUser.first_name,
          last_name: cachedUser.last_name || '',
          role,
          manager_id: user?.id, // Assign to current user if manager, or select...
          establishment_id: 1
        })
      });
      setShowAddModal(false);
      fetch(`${API_URL}/api/users`).then(res => res.json()).then(setUsers);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-4 pb-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Команда</h1>
        {user?.role === 'admin' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="p-2 bg-blue-600 text-white rounded-lg shadow-md"
          >
            <UserPlus size={20} />
          </button>
        )}
      </div>

      <div className="space-y-4">
        {users.map(u => (
          <div key={u.id} className="bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between">
            <div>
              <div className="font-bold">{u.first_name} {u.last_name}</div>
              <div className="text-sm text-gray-500">@{u.username}</div>
            </div>
            <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium uppercase text-gray-600">
              {u.role}
            </span>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Добавить сотрудника</h2>
            <p className="text-sm text-gray-500">Выберите пользователя из тех, кто писал боту:</p>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              {cachedUsers.length === 0 ? (
                <div className="text-center py-4 text-gray-400 text-sm">
                  Нет новых пользователей. Попросите сотрудника написать /start боту.
                </div>
              ) : (
                cachedUsers.map(cu => (
                  <div key={cu.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{cu.first_name}</div>
                      <div className="text-xs text-gray-500">@{cu.username}</div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleCreateUser(cu, 'manager')}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                      >
                        Менеджер
                      </button>
                      <button 
                        onClick={() => handleCreateUser(cu, 'employee')}
                        className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs font-medium"
                      >
                        Сотрудник
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button 
              onClick={() => setShowAddModal(false)}
              className="w-full py-3 text-gray-600 font-medium"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
