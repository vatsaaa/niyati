const { createErrorResponse, createSuccessResponse, ErrorCodes } = require('../lib/responses');

describe('commons responses', () => {
  test('createErrorResponse includes code and message', () => {
    const r = createErrorResponse(ErrorCodes.BAD_REQUEST, 'oops', { details: { field: 'x' }, reqId: 'rid' });
    expect(r.status).toBe('error');
    expect(r.error.code).toBe(ErrorCodes.BAD_REQUEST);
    expect(r.reqId).toBe('rid');
  });

  test('createSuccessResponse wraps data', () => {
    const r = createSuccessResponse({ hello: 'world' }, { meta: { t: 1 }, reqId: 'rid2' });
    expect(r.status).toBe('ok');
    expect(r.data).toEqual({ hello: 'world' });
    expect(r.reqId).toBe('rid2');
  });
});
