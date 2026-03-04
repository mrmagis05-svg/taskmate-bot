import { useState } from 'react';
import { API_URL } from '../config';

export default function WebhookSimulator() {
  const [username, setUsername] = useState('newuser');
  const [chatId, setChatId] = useState('1001');
  const [message, setMessage] = useState('/start');
  const [response, setResponse] = useState('');

  const sendWebhook = async () => {
    try {
      const res = await fetch(`${API_URL}/webhook/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_id: Date.now(),
          message: {
            message_id: 1,
            from: {
              id: parseInt(chatId),
              is_bot: false,
              first_name: 'Test',
              last_name: 'User',
              username: username,
              language_code: 'ru'
            },
            chat: {
              id: parseInt(chatId),
              first_name: 'Test',
              last_name: 'User',
              username: username,
              type: 'private'
            },
            date: Math.floor(Date.now() / 1000),
            text: message
          }
        })
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
      alert('Webhook sent! Check "Team" page to see if user appears in cache (if /start was sent).');
    } catch (e: any) {
      setResponse(e.message);
    }
  };

  return (
    <div className="p-4 bg-white rounded-xl border border-gray-200 mt-4">
      <h3 className="font-bold mb-4">Telegram Webhook Simulator</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500">Username</label>
          <input className="border p-2 rounded w-full" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Chat ID</label>
          <input className="border p-2 rounded w-full" value={chatId} onChange={e => setChatId(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Message</label>
          <input className="border p-2 rounded w-full" value={message} onChange={e => setMessage(e.target.value)} />
        </div>
        <button onClick={sendWebhook} className="bg-blue-600 text-white px-4 py-2 rounded-lg w-full">
          Send Webhook
        </button>
        {response && <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">{response}</pre>}
      </div>
    </div>
  );
}
