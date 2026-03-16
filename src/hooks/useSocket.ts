import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Only initialize socket if in browser environment
    if (typeof window === 'undefined') return;

    // Check if socket server is available
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

    try {
      // Initialize socket connection with error handling
      // Authentication is handled via the drais_session HTTP-only cookie
      const socketInstance = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 3, // Reduced attempts
        reconnectionDelay: 2000,
        forceNew: true
      });

      socketInstance.on('connect', () => {
        console.log('Socket connected:', socketInstance.id);
        setSocket(socketInstance);
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setSocket(null);
      });

      socketInstance.on('connect_error', (error) => {
        console.warn('Socket connection error (this is expected if socket server is not running):', error.message);
        // Don't set socket to null on connection error to allow retries
      });

      // Set socket immediately for optimistic connection
      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
        setSocket(null);
      };
    } catch (error) {
      console.warn('Socket initialization failed:', error);
      return;
    }
  }, []);

  return socket;
};
