export class MotiSigApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'MotiSigApiError';
  }
}

export class MotiSigError extends Error {
  constructor(message: string, public readonly code: 'not_initialized' | 'no_user' | 'no_token' | 'not_device') {
    super(message);
    this.name = 'MotiSigError';
  }
}
