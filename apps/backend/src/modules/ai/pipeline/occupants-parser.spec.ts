import { parseOccupants } from './occupants-parser';

describe('parseOccupants — số người ở tất định', () => {
  it('"ở một mình" -> 1', () => {
    expect(parseOccupants('mình ở một mình').occupants).toBe(1);
  });
  it('"hai vợ chồng" -> 2', () => {
    expect(parseOccupants('hai vợ chồng ở').occupants).toBe(2);
  });
  it('"vợ chồng" -> 2', () => {
    expect(parseOccupants('nhà mình vợ chồng thôi').occupants).toBe(2);
  });
  it('"2 người" -> 2', () => {
    expect(parseOccupants('ở 2 người').occupants).toBe(2);
  });
  it('"nhóm 3 bạn" -> 3', () => {
    expect(parseOccupants('nhóm 3 bạn ở ghép').occupants).toBe(3);
  });
  it('"nhóm bốn bạn" -> 4', () => {
    expect(parseOccupants('tụi mình nhóm bốn bạn').occupants).toBe(4);
  });
  it('không nói -> rỗng', () => {
    expect(parseOccupants('còn phòng không').occupants).toBeUndefined();
  });
});
