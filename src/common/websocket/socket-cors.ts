/**
 * CORS for the Socket.IO gateways, kept identical to the HTTP CORS in main.ts:
 * the origins come from CORS_ORIGIN (comma separated); when it is unset (non-production only,
 * main.ts refuses to start in production without it) every origin is allowed.
 *
 * The decorator options of a gateway are evaluated when the file is imported, which is before
 * ConfigModule has loaded the .env file, so the allow-list is read per handshake instead.
 * Requests without an Origin header (the mobile apps) are not browser cross-origin requests
 * and are allowed, exactly as the HTTP CORS middleware does.
 */
export const socketCors = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void => {
    const configured = process.env.CORS_ORIGIN?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? ['*'];

    if (!origin || configured.includes('*') || configured.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
};
