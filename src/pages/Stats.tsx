import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import WebhookSimulator from '../components/WebhookSimulator';

const data = [
  { name: 'Пн', tasks: 12 },
  { name: 'Вт', tasks: 19 },
  { name: 'Ср', tasks: 15 },
  { name: 'Чт', tasks: 22 },
  { name: 'Пт', tasks: 18 },
  { name: 'Сб', tasks: 10 },
  { name: 'Вс', tasks: 5 },
];

export default function Stats() {
  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold mb-6">Статистика</h1>
      
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-6">
        <h3 className="font-medium mb-4">Выполнение задач (неделя)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
              <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Bar dataKey="tasks" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Топ сотрудников</h3>
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500">
              {i}
            </div>
            <div className="flex-1">
              <div className="font-medium">Иван Иванов</div>
              <div className="text-xs text-gray-500">98% выполнено вовремя</div>
            </div>
            <div className="text-green-600 font-bold">4.9</div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-gray-100 rounded-xl">
        <h3 className="font-bold mb-2">Admin Tools</h3>
        <button 
          onClick={() => fetch('/api/cron/run', { method: 'POST' }).then(res => res.json()).then(d => alert(`Created ${d.created} tasks`))}
          className="bg-black text-white px-4 py-2 rounded-lg text-sm"
        >
          Run Daily Cron (Simulate)
        </button>
      </div>

      <WebhookSimulator />
    </div>
  );
}
