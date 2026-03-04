import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { API_URL } from "../config"

// Mock types for our auth context
export type UserRole = 'admin' | 'manager' | 'employee';

export interface User {
  id: number;
  telegram_chat_id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  manager_id?: number;
  establishment_id?: number;
}

interface AuthContextType {
  user: User | null;
  login: (userId: number) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persisted mock session
    const storedUserId = localStorage.getItem('mock_user_id');
    if (storedUserId) {
      fetchUsers().then(users => {
        const found = users.find((u: User) => u.id === parseInt(storedUserId));
        if (found) setUser(found);
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (userId: number) => {
    setIsLoading(true);
    const users = await fetchUsers();
    const found = users.find((u: User) => u.id === userId);
    if (found) {
      setUser(found);
      localStorage.setItem('mock_user_id', userId.toString());
    }
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('mock_user_id');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper to fetch users for the mock login screen
export async function fetchUsers() {
  try {
    const res = await fetch(`${API_URL}/api/users`);
    return await res.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}
