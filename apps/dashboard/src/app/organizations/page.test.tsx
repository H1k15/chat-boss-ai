import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrganizationsPage from './page';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getRole: () => 'SUPER_ADMIN',
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const tenant = {
  id: 'o1',
  name: 'An Bình',
  slug: 'an-binh',
  plan: 'free',
  isActive: true,
  subscriptionExpiresAt: null,
  note: null,
  archivedAt: null,
  isSystem: false,
  adminEmail: 'a@x.vn',
  version: '2026-01-01T00:00:00.000Z',
  counts: { users: 1, rooms: 2, customers: 3 },
};

const btn = (re: RegExp) => screen.getByRole('button', { name: re }) as HTMLButtonElement;

describe('Trang Quản lý nhà trọ', () => {
  beforeEach(() => {
    vi.mocked(api.apiGet).mockResolvedValue([{ ...tenant }]);
    vi.mocked(api.apiPost).mockReset();
  });

  it('render danh sách + nút Lưu disabled khi chưa có draft', async () => {
    render(<OrganizationsPage />);
    await screen.findByText('An Bình');
    expect(btn(/Lưu thay đổi/).disabled).toBe(true);
  });

  it('đổi gói -> tạo DRAFT, KHÔNG gọi API, nút Lưu bật với (1)', async () => {
    render(<OrganizationsPage />);
    await screen.findByText('An Bình');
    const planSelect = screen
      .getAllByRole('combobox')
      .find((s) => (s as HTMLSelectElement).value === 'free')!;
    fireEvent.change(planSelect, { target: { value: 'pro' } });
    expect(api.apiPost).not.toHaveBeenCalled(); // không thực thi ngay
    expect(btn(/Lưu thay đổi \(1\)/).disabled).toBe(false);
  });

  it('Hủy thay đổi xoá draft (nút Lưu disabled trở lại)', async () => {
    render(<OrganizationsPage />);
    await screen.findByText('An Bình');
    const planSelect = screen
      .getAllByRole('combobox')
      .find((s) => (s as HTMLSelectElement).value === 'free')!;
    fireEvent.change(planSelect, { target: { value: 'pro' } });
    expect(btn(/Lưu thay đổi \(1\)/).disabled).toBe(false);
    fireEvent.click(btn(/Hủy thay đổi/));
    await screen.findByText('An Bình');
    expect(btn(/Lưu thay đổi/).disabled).toBe(true);
  });
});
