import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage } from '@/types';

interface UseWebSocketOptions {
  onReconnect?: () => void;
}

export function useWebSocket(userId: string | null, options?: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [messageQueue, setMessageQueue] = useState<WebSocketMessage[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnect = useRef(true);
  const isReconnecting = useRef(false);
  const onReconnectRef = useRef(options?.onReconnect);

  // Update ref when callback changes, but don't trigger reconnection
  useEffect(() => {
    onReconnectRef.current = options?.onReconnect;
  }, [options?.onReconnect]);

  const connect = useCallback(() => {
    // Only connect if we have a valid userId for authenticated state
    if (!userId) {
      return;
    }

    // Only connect if we're in browser and have valid window.location
    if (typeof window === 'undefined' || !window.location || !window.location.host) {
      console.warn('⚠️ WebSocket connection skipped: window.location not available yet');
      return;
    }

    // Clear any existing connection
    if (ws.current) {
      ws.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || 'localhost:5000'; // Fallback for safety
    const wsUrl = `${protocol}//${host}/ws?userId=${userId}`;
    
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
    console.log(`🔍 Production Debug - Protocol: ${window.location.protocol}, Host: ${host}`);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      
      // CRITICAL FIX: Trigger state recovery on reconnection
      if (isReconnecting.current && onReconnectRef.current) {
        console.log('🔄 WebSocket reconnected - triggering state recovery');
        onReconnectRef.current();
      }
      isReconnecting.current = false;
      
      // Clear any reconnection timeout on successful connection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('📨 WebSocket message received:', message.type, message.generationId, 'progress:', message.progress);
        
        // Append message to queue instead of replacing state
        // This prevents message loss when multiple messages arrive in rapid succession
        setMessageQueue(prev => [...prev, message]);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      setIsConnected(false);
      
      // Attempt to reconnect if we should
      if (shouldReconnect.current) {
        isReconnecting.current = true; // Mark as reconnecting for state recovery
        console.log('🔄 Attempting to reconnect WebSocket in 3 seconds...');
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.current.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      setIsConnected(false);
    };
  }, [userId]); // Removed options from deps - using ref instead

  useEffect(() => {
    shouldReconnect.current = true;
    connect();

    // iOS Safari fix: Reconnect WebSocket when page becomes visible
    // Safari may close WebSocket connections when the tab is in the background
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 Page became visible - checking WebSocket connection');
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
          console.log('🔄 WebSocket disconnected while in background, reconnecting...');
          isReconnecting.current = true;
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      shouldReconnect.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const sendMessage = (message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  };

  return { isConnected, messageQueue, setMessageQueue, sendMessage };
}