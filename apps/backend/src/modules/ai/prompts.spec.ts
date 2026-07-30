import { formatConversation } from './prompts';
import { ConversationTurn } from '@cba/shared';

describe('formatConversation — cắt cửa sổ hội thoại (tiết kiệm token)', () => {
  const conv: ConversationTurn[] = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 === 0 ? 'customer' : 'staff',
    text: `t${i}`,
  }));

  it('không maxTurns -> giữ full', () => {
    const out = formatConversation(conv);
    expect(out.split('\n')).toHaveLength(10);
    expect(out).toContain('t0');
    expect(out).toContain('t9');
  });

  it('maxTurns nhỏ hơn độ dài -> chỉ giữ N lượt GẦN NHẤT (còn tin cuối)', () => {
    const out = formatConversation(conv, 3);
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(out).toContain('t7');
    expect(out).toContain('t9'); // tin cuối luôn còn
    expect(out).not.toContain('t0'); // lượt cũ bị bỏ
  });

  it('maxTurns >= độ dài -> no-op (chat ngắn không đổi)', () => {
    expect(formatConversation(conv, 50)).toBe(formatConversation(conv));
  });

  it('nhãn Khách/NV đúng vai', () => {
    expect(formatConversation([{ role: 'customer', text: 'hi' }])).toBe('Khách: hi');
    expect(formatConversation([{ role: 'staff', text: 'chào' }])).toBe('NV: chào');
  });
});
