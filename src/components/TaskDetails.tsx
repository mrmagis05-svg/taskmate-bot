import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { X, Send, MessageSquare, History } from 'lucide-react';
import { API_URL } from '../config';

interface TaskDetailsProps {
  taskId: number;
  onClose: () => void;
}

export default function TaskDetails({ taskId, onClose }: TaskDetailsProps) {
  const { user, getAuthHeaders } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchComments();
  }, [taskId]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}/comments`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      setComments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      await fetch(`${API_URL}/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ text: newComment, user_id: user?.id })
      });
      setNewComment('');
      fetchComments();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl h-[80vh] flex flex-col shadow-xl">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-lg">Детали задачи #{taskId}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2 text-gray-700">
              <MessageSquare size={16} /> Комментарии
            </h4>
            
            {loading ? (
              <div className="text-center text-gray-400 text-sm">Загрузка...</div>
            ) : comments.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">Нет комментариев</div>
            ) : (
              <div className="space-y-3">
                {comments.map((c: any) => (
                  <div key={c.id} className={`flex gap-3 ${c.author_user_id === user?.id ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                      {c.first_name?.[0]}
                    </div>
                    <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                      c.author_user_id === user?.id ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'
                    }`}>
                      <p>{c.text}</p>
                      <div className={`text-[10px] mt-1 ${c.author_user_id === user?.id ? 'text-blue-200' : 'text-gray-400'}`}>
                        {format(new Date(c.created_at), 'HH:mm dd.MM', { locale: ru })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSendComment} className="p-4 border-t border-gray-100 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Написать комментарий..."
            className="flex-1 bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button 
            type="submit"
            disabled={!newComment.trim()}
            className="bg-blue-600 text-white p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
