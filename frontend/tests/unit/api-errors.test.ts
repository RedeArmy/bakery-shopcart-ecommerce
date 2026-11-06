// cspell:disable
import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../src/shared/api/error-message';
import { ApiError, toApiError, unwrap } from '../../src/shared/api/result';
import '../../src/shared/i18n';

const body = (code: string, extra = {}) => ({
  error: { code, message: 'English message', requestId: 'req-1', ...extra },
});

describe('toApiError', () => {
  it('reads the unique error shape of the API', () => {
    const error = toApiError(409, body('INSUFFICIENT_STOCK', { details: { available: 2 } }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      requestId: 'req-1',
      details: { available: 2 },
    });
  });

  it('survives a body that does not have the expected shape', () => {
    expect(toApiError(502, undefined)).toMatchObject({ status: 502, code: 'UNEXPECTED' });
    expect(toApiError(500, { error: { code: 7 } })).toMatchObject({ code: 'UNEXPECTED' });
    expect(toApiError(500, 'plain text')).toMatchObject({ code: 'UNEXPECTED' });
  });

  it('keeps the seconds that the server asks to wait', () => {
    const headers = new Headers({ 'Retry-After': '30' });
    expect(toApiError(429, body('RATE_LIMITED'), headers).retryAfterSeconds).toBe(30);
    expect(toApiError(429, body('RATE_LIMITED'), new Headers()).retryAfterSeconds).toBeUndefined();
    expect(
      toApiError(429, body('RATE_LIMITED'), new Headers({ 'Retry-After': 'soon' }))
        .retryAfterSeconds,
    ).toBeUndefined();
  });
});

describe('unwrap', () => {
  it('returns the data of a successful call, including an empty one', () => {
    expect(unwrap({ data: { ok: true }, response: new Response() })).toEqual({ ok: true });
    expect(unwrap({ response: new Response(null, { status: 204 }) })).toBeUndefined();
  });

  it('throws the ApiError of a failed call', () => {
    const failure = { error: body('NOT_FOUND'), response: new Response(null, { status: 404 }) };
    expect(() => unwrap(failure)).toThrow(ApiError);
    expect(() => unwrap(failure)).toThrow(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND' }) as Error,
    );
  });

  it('also throws when the status is an error but the body is empty', () => {
    expect(() => unwrap({ response: new Response(null, { status: 500 }) })).toThrow(ApiError);
  });
});

describe('errorMessage', () => {
  it('translates the stable code into Spanish and never shows the English message', () => {
    const text = errorMessage(toApiError(401, body('INVALID_CREDENTIALS')));
    expect(text).toBe('El correo o la contraseña no son correctos.');
    expect(text).not.toContain('English');
  });

  it('uses the generic Spanish text for a code that has no translation', () => {
    expect(errorMessage(toApiError(500, body('SOMETHING_NEW')))).toBe(
      'Ocurrió un error inesperado. Intente de nuevo.',
    );
  });

  it('says there is no connection when the request never reached the server', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toContain('No hay conexión');
  });

  it('uses the generic text for anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('Ocurrió un error inesperado. Intente de nuevo.');
    expect(errorMessage('boom')).toBe('Ocurrió un error inesperado. Intente de nuevo.');
  });
});
