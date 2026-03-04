import { useAuth, fetchUsers, User } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

export default function Login() {
  const { login } = useAuth();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetchUsers().then(setUsers);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-center mb-2">TaskMate Bot</h1>
        <p className="text-gray-500 text-center mb-8">Dev Mode Login</p>
        
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-700">Select a user to emulate:</p>
          <div className="grid gap-3">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => login(u.id)}
                className={cn(
                  "flex items-center p-4 border rounded-xl hover:bg-gray-50 transition-colors text-left",
                  u.role === 'admin' ? "border-purple-200 bg-purple-50 hover:bg-purple-100" :
                  u.role === 'manager' ? "border-blue-200 bg-blue-50 hover:bg-blue-100" :
                  "border-gray-200"
                )}
              >
                <div className="flex-1">
                  <div className="font-semibold">{u.first_name} {u.last_name}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">{u.role}</div>
                </div>
                <div className="text-gray-400">→</div>
              </button>
            ))}
          </div>
          
          {users.length === 0 && (
            <div className="text-center text-gray-400 py-4">
              No users found. Database might be initializing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
