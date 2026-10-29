import { ApiError } from '../../../core/http/api-error';
import { UNDO_WINDOW_MS, binderGameError } from './inventory-actions.service';

function error(errorCode: string): ApiError {
  return new ApiError({ errorCode, message: 'x', requestId: null, status: 409, fieldErrors: {} });
}

describe('binder game errors (stage G 409s, spec 9.12)', () => {
  it('says both 409s in plain words', () => {
    expect(binderGameError(error('BINDER_GAME_MISMATCH'), 'Yu-Gi-Oh!')).toBe(
      'Only Yu-Gi-Oh! cards can go in this binder.',
    );
    expect(binderGameError(error('BINDER_GAME_LOCKED'), 'Yu-Gi-Oh!')).toBe(
      "This binder already has Yu-Gi-Oh! cards, so its game can't change.",
    );
    expect(binderGameError(error('BINDER_GAME_LOCKED'), null)).toBe(
      "This binder already has cards, so its game can't change.",
    );
    expect(binderGameError(error('BINDER_GAME_MISMATCH'), null)).toBe(
      "Only cards of this binder's game can go in it.",
    );
    expect(binderGameError(error('CONFLICT'), 'Yu-Gi-Oh!')).toBeNull();
  });

  it("keeps an Undo for the server's 10 minutes", () => {
    expect(UNDO_WINDOW_MS).toBe(600_000);
  });
});
