import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { query } from '@/lib/db';

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;
  private userSockets: Map<number, string[]> = new Map(); // userId -> socket ids

  private constructor() {}

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  initialize(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      console.log(`User ${userId} connected: ${socket.id}`);

      // Track user socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, []);
      }
      this.userSockets.get(userId)?.push(socket.id);

      // Join user room
      socket.join(`user:${userId}`);

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${userId} disconnected: ${socket.id}`);
        const sockets = this.userSockets.get(userId) || [];
        const index = sockets.indexOf(socket.id);
        if (index > -1) {
          sockets.splice(index, 1);
          if (sockets.length === 0) {
            this.userSockets.delete(userId);
          }
        }
      });

      // Handle notification acknowledgments
      socket.on('notification:ack', (data) => {
        console.log(`Notification ${data.notificationId} acknowledged by user ${userId}`);
      });

      // Handle real-time requests
      socket.on('notifications:subscribe', () => {
        socket.join(`notifications:${userId}`);
      });

      socket.on('notifications:unsubscribe', () => {
        socket.leave(`notifications:${userId}`);
      });
    });

    console.log('Socket.IO server initialized');
  }

  private async authenticateSocket(socket: Socket, next: (err?: Error) => void) {
    try {
      // Extract drais_session cookie from the handshake HTTP headers
      const cookieHeader = socket.handshake.headers.cookie || '';
      const match = cookieHeader.match(/(?:^|;\s*)drais_session=([^;]+)/);
      const sessionToken = match ? decodeURIComponent(match[1]) : null;

      if (!sessionToken) {
        throw new Error('No session cookie provided');
      }

      // Validate session against the database
      const sessions: any[] = await query(
        `SELECT s.user_id, s.school_id
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = ?
           AND s.is_active = TRUE
           AND s.expires_at > NOW()
           AND u.deleted_at IS NULL
         LIMIT 1`,
        [sessionToken]
      );

      if (!sessions || sessions.length === 0) {
        throw new Error('Invalid or expired session');
      }

      socket.data.userId = Number(sessions[0].user_id);
      socket.data.schoolId = Number(sessions[0].school_id);

      next();
    } catch (error) {
      console.error('Socket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  }

  emitToUser(userId: number, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  emitToSchool(schoolId: number, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`school:${schoolId}`).emit(event, data);
    }
  }

  emitToAll(event: string, data: unknown) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  isUserOnline(userId: number): boolean {
    return this.userSockets.has(userId) && (this.userSockets.get(userId)?.length || 0) > 0;
  }

  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }
}

export default SocketService;
