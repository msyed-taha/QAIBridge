import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsEvent } from '../types';

export function useWebSocket(path: string) {
  const ws = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}${path}`;
    const socket = new WebSocket(url);

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (ev) => {
      try {
        setLastEvent(JSON.parse(ev.data) as WsEvent);
      } catch { /* ignore */ }
    };

    ws.current = socket;
    return () => socket.close();
  }, [path]);

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, lastEvent, send };
}
