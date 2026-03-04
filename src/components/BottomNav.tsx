import { Home, CheckSquare, AlertCircle, Users, BarChart2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

export default function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 pb-safe flex justify-around items-center z-50">
      <Link to="/" className={cn("flex flex-col items-center gap-1 p-2 rounded-lg transition-colors", isActive('/') ? "text-blue-600" : "text-gray-400")}>
        <Home size={24} strokeWidth={isActive('/') ? 2.5 : 2} />
        <span className="text-[10px] font-medium">Домой</span>
      </Link>
      
      <Link to="/tasks" className={cn("flex flex-col items-center gap-1 p-2 rounded-lg transition-colors", isActive('/tasks') ? "text-blue-600" : "text-gray-400")}>
        <CheckSquare size={24} strokeWidth={isActive('/tasks') ? 2.5 : 2} />
        <span className="text-[10px] font-medium">Задачи</span>
      </Link>

      <Link to="/overdue" className={cn("flex flex-col items-center gap-1 p-2 rounded-lg transition-colors", isActive('/overdue') ? "text-red-500" : "text-gray-400")}>
        <AlertCircle size={24} strokeWidth={isActive('/overdue') ? 2.5 : 2} />
        <span className="text-[10px] font-medium">Срочно</span>
      </Link>

      {(user?.role === 'admin' || user?.role === 'manager') && (
        <Link to="/team" className={cn("flex flex-col items-center gap-1 p-2 rounded-lg transition-colors", isActive('/team') ? "text-blue-600" : "text-gray-400")}>
          <Users size={24} strokeWidth={isActive('/team') ? 2.5 : 2} />
          <span className="text-[10px] font-medium">Команда</span>
        </Link>
      )}

      {user?.role === 'admin' && (
        <Link to="/stats" className={cn("flex flex-col items-center gap-1 p-2 rounded-lg transition-colors", isActive('/stats') ? "text-blue-600" : "text-gray-400")}>
          <BarChart2 size={24} strokeWidth={isActive('/stats') ? 2.5 : 2} />
          <span className="text-[10px] font-medium">Отчеты</span>
        </Link>
      )}
    </div>
  );
}
