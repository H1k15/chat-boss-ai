'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

interface Template {
  id: string;
  intent: string;
  label: string;
  content: string;
  isActive: boolean;
}

// 11 ý định (khớp enum CustomerIntent ở backend). Ưu tiên soạn 4 cái đầu.
const INTENTS = [
  'ASK_PRICE',
  'ASK_AVAILABILITY',
  'ASK_ADDRESS',
  'WANT_VIEWING',
  'ASK_UTILITIES',
  'ASK_MEDIA',
  'LEFT_PHONE',
  'GREETING',
  'SMALL_TALK',
  'IRRELEVANT',
  'OTHER',
];

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [err, setErr] = useState('');
  const [intent, setIntent] = useState('ASK_PRICE');
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');

  function load() {
    apiGet<Template[]>('/reply-templates')
      .then(setItems)
      .catch((e) => setErr(String(e)));
  }
  useEffect(load, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !content.trim()) return;
    try {
      await apiPost('/reply-templates', { intent, label, content });
      setLabel('');
      setContent('');
      load();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function toggle(t: Template) {
    await apiPatch(`/reply-templates/${t.id}`, { isActive: !t.isActive });
    load();
  }
  async function remove(id: string) {
    if (!confirm('Xoá mẫu câu này?')) return;
    await apiDelete(`/reply-templates/${id}`);
    load();
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold mb-1">Mẫu câu AI</h2>
      <p className="text-gray-600 text-sm mb-4">
        Mẫu câu là ví dụ để AI bắt chước giọng đội bạn. Hệ thống lấy tối đa 5 mẫu
        đang bật cho mỗi ý định.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm mb-4">
        <b>3 quy tắc bắt buộc</b> (sai là câu bị chặn):
        <ol className="list-decimal ml-5 mt-1">
          <li>
            Không ghi số tiền cụ thể — dùng chỗ trống{' '}
            <code>{'{{gia}}'}</code>, <code>{'{{coc}}'}</code>.
          </li>
          <li>Không ghi số điện thoại.</li>
          <li>Giữ ngắn, dưới 200 ký tự.</li>
        </ol>
      </div>

      <form onSubmit={add} className="bg-white border rounded p-4 mb-6">
        <div className="flex gap-2 mb-2">
          <select
            className="border p-2 rounded"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          >
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <input
            className="border p-2 rounded flex-1"
            placeholder="Nhãn (để bạn dễ nhận ra)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <textarea
          className="border p-2 rounded w-full mb-2"
          rows={2}
          placeholder="Nội dung mẫu, ví dụ: Dạ phòng này giá {{gia}}/tháng anh nhé"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button className="bg-blue-600 text-white px-4 py-2 rounded">
            Thêm mẫu
          </button>
          <span
            className={`text-sm ${content.length > 200 ? 'text-red-600' : 'text-gray-400'}`}
          >
            {content.length}/200 ký tự
          </span>
        </div>
      </form>

      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}

      {INTENTS.map((i) => {
        const group = items.filter((t) => t.intent === i);
        if (!group.length) return null;
        return (
          <div key={i} className="mb-4">
            <h3 className="font-semibold text-sm text-gray-700 mb-1">
              {i} <span className="text-gray-400">({group.length})</span>
            </h3>
            <div className="bg-white border rounded divide-y">
              {group.map((t) => (
                <div
                  key={t.id}
                  className="p-3 flex items-start gap-3 text-sm"
                >
                  <div className="flex-1">
                    <div className="text-gray-400 text-xs">{t.label}</div>
                    <div className={t.isActive ? '' : 'text-gray-400 line-through'}>
                      {t.content}
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(t)}
                    className={`text-xs px-2 py-1 rounded ${
                      t.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {t.isActive ? 'Đang bật' : 'Đã tắt'}
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="text-xs text-red-500 px-1"
                  >
                    Xoá
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
