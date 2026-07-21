// Cấu hình endpoint backend. Có thể ghi đè bằng chrome.storage khi build production.
export const API_BASE =
  (globalThis as { CBA_API_BASE?: string }).CBA_API_BASE ||
  'http://localhost:3001/api/v1';
