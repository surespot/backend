import { Server } from 'socket.io';

/**
 * Emit to a Socket.io room with one retry on failure to improve delivery under
 * transient errors (e.g. brief event-loop delay, connection churn).
 * Does not throw; returns false on failure after retry.
 */
export async function emitToRoomWithRetry(
  server: Server,
  room: string,
  event: string,
  data: unknown,
  retryDelayMs: number = 100,
): Promise<boolean> {
  const attempt = (): boolean => {
    try {
      server.to(room).emit(event, data);
      return true;
    } catch {
      return false;
    }
  };

  if (attempt()) return true;
  await new Promise((r) => setTimeout(r, retryDelayMs));
  return attempt();
}
