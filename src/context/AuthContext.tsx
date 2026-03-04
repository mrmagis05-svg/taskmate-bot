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
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (user) {
      if (user.telegram_chat_id) {
        headers['x-chat-id'] = user.telegram_chat_id.toString();
      }
      // Also send dev ID for fallback/hybrid testing
      headers['x-dev-user-id'] = user.id.toString();
    }
    return headers;
  };

  useEffect(() => {
    const initAuth = async () => {
      // 1. Check Telegram WebApp
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user?.id) {
        const tgUserId = tg.initDataUnsafe.user.id;
        try {
          const users = await fetchUsers();
          const found = users.find((u: User) => u.telegram_chat_id === tgUserId);
          if (found) {
            setUser(found);
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.error("Failed to fetch users for TG auth", e);
        }
      }

      // 2. Check local storage for persisted mock session
      const storedUserId = localStorage.getItem('mock_user_id');
      if (storedUserId) {
        try {
          const users = await fetchUsers();
          const found = users.find((u: User) => u.id === parseInt(storedUserId));
          if (found) setUser(found);
        } catch (e) {
          console.error("Failed to fetch users for local auth", e);
        }
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (userId: number) => {
    setIsLoading(true);
    try {
      const users = await fetchUsers();
      const found = users.find((u: User) => u.id === userId);
      if (found) {
        setUser(found);
        localStorage.setItem('mock_user_id', userId.toString());
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('mock_user_id');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, getAuthHeaders }}>
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

import { API_URL } from '../config';

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
