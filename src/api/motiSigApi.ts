import type {
  MotiSigUser,
  PushSubscriptionPatchPayload,
  PushSubscriptionRemovePayload,
  PushSubscriptionUpsertPayload,
  RegisterUserPayload,
  TrackClickPayload,
  UpdateUserPayload,
} from '../types';
import { MotiSigHttpClient } from './httpClient';

export interface RegisterUserResponse {
  success: boolean;
  userId: string;
}

export interface TriggerEventResponse {
  success: boolean;
  message: string;
}

/** Typed MotiSig AI REST client. */
export class MotiSigApi {
  constructor(private readonly http: MotiSigHttpClient) {}

  async getUser(userId: string): Promise<MotiSigUser | null> {
    const res = await this.http.request<{ user?: MotiSigUser }>('GET', `/users/${encodeURIComponent(userId)}`);
    if (res.status === 404) return null;
    const data = this.http.assertOk(res);
    return data.user ?? null;
  }

  async registerUser(payload: RegisterUserPayload): Promise<RegisterUserResponse> {
    const res = await this.http.request<RegisterUserResponse>('POST', '/users', payload);
    return this.http.assertOk(res);
  }

  async updateUser(userId: string, payload: UpdateUserPayload): Promise<void> {
    const res = await this.http.request<unknown>(
      'PATCH',
      `/users/${encodeURIComponent(userId)}`,
      payload
    );
    this.http.assertOk(res);
  }

  async addTags(userId: string, tags: string[]): Promise<void> {
    const res = await this.http.request<unknown>(
      'POST',
      `/users/${encodeURIComponent(userId)}/tags`,
      { tags }
    );
    this.http.assertOk(res);
  }

  async removeTags(userId: string, tags: string[]): Promise<void> {
    const res = await this.http.request<unknown>(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/tags`,
      { tags }
    );
    this.http.assertOk(res);
  }

  async addOrUpdateAttributes(userId: string, attributes: Record<string, unknown>): Promise<void> {
    const res = await this.http.request<unknown>(
      'POST',
      `/users/${encodeURIComponent(userId)}/attributes`,
      { attributes }
    );
    this.http.assertOk(res);
  }

  async removeAttributes(userId: string, keys: string[]): Promise<void> {
    const res = await this.http.request<unknown>(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/attributes`,
      { keys }
    );
    this.http.assertOk(res);
  }

  async upsertPushSubscription(userId: string, payload: PushSubscriptionUpsertPayload): Promise<void> {
    const res = await this.http.request<unknown>(
      'POST',
      `/users/${encodeURIComponent(userId)}/push-subscriptions`,
      payload
    );
    this.http.assertOk(res);
  }

  async patchPushSubscription(userId: string, payload: PushSubscriptionPatchPayload): Promise<void> {
    const res = await this.http.request<unknown>(
      'PATCH',
      `/users/${encodeURIComponent(userId)}/push-subscriptions`,
      payload
    );
    this.http.assertOk(res);
  }

  async removePushSubscription(userId: string, payload: PushSubscriptionRemovePayload): Promise<void> {
    const res = await this.http.request<unknown>(
      'DELETE',
      `/users/${encodeURIComponent(userId)}/push-subscriptions`,
      payload
    );
    this.http.assertOk(res);
  }

  async ping(userId: string): Promise<void> {
    let res = await this.http.request<unknown>(
      'POST',
      `/users/${encodeURIComponent(userId)}/ping`,
      {}
    );
    if (!res.ok && res.status === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await this.http.request<unknown>(
        'POST',
        `/users/${encodeURIComponent(userId)}/ping`,
        {}
      );
    }
    this.http.assertOk(res);
  }

  async trackClick(payload: TrackClickPayload): Promise<void> {
    const res = await this.http.request<unknown>('POST', '/track/click', payload);
    this.http.assertOk(res);
  }

  async triggerEvent(
    userId: string,
    eventName: string,
    eventData?: Record<string, unknown>
  ): Promise<string> {
    const body: {
      userId: string;
      eventName: string;
      eventData?: Record<string, unknown>;
    } = { userId, eventName };
    if (eventData !== undefined) body.eventData = eventData;
    const res = await this.http.request<TriggerEventResponse>('POST', '/events', body);
    const data = this.http.assertOk(res);
    return data.message;
  }
}

export function createMotiSigApi(
  options: ConstructorParameters<typeof MotiSigHttpClient>[0]
): MotiSigApi {
  return new MotiSigApi(new MotiSigHttpClient(options));
}

export type { AppPlatform, PushPlatform } from '../types';
