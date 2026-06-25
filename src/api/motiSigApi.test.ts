import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMotiSigApi } from './motiSigApi';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

describe('MotiSigApi.registerUser', () => {
  it('posts to /users with id, platform, and profile fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          userId: 'user-123',
        }),
        { status: 200 },
      ),
    );

    const api = createMotiSigApi({
      baseUrl: 'https://api.example.com/client',
      sdkKey: 'sdk-key',
      projectId: 'proj-1',
    });

    const result = await api.registerUser({
      id: 'user-123',
      platform: 'ios',
      email: 'a@example.com',
      firstName: 'Ada',
    });

    expect(result.userId).toBe('user-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.id).toBe('user-123');
    expect(body.platform).toBe('ios');
    expect(body.email).toBe('a@example.com');
    expect(body.firstName).toBe('Ada');
  });
});
