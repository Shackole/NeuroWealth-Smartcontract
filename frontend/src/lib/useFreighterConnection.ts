'use client';

import { useRef, useState } from 'react';
import { connectFreighterWallet, FREIGHTER_TIMEOUT_MESSAGE } from './freighter';

type ConnectionStatus = 'idle' | 'pending' | 'timeout' | 'ready' | 'failed';

export function useFreighterConnection() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const connecting = useRef(false);

  async function connect(onConnect: (key: string) => void) {
    if (connecting.current) return;
    connecting.current = true;
    let timedOut = false;

    try {
      const key = await connectFreighterWallet((detection) => {
        timedOut = detection === 'timeout';
        setStatus(detection);
      });
      if (key) {
        setStatus('idle');
        onConnect(key);
      } else if (!timedOut) {
        setStatus('failed');
      }
    } finally {
      connecting.current = false;
    }
  }

  const isConnecting = status === 'pending' || status === 'ready';
  const message = {
    idle: '',
    pending: 'Waiting for the Freighter extension…',
    timeout: FREIGHTER_TIMEOUT_MESSAGE,
    ready: 'Approve the connection in Freighter.',
    failed: 'Wallet connection was unsuccessful. Open Freighter and try again.',
  }[status];

  return { connect, isConnecting, message, canRetry: status === 'timeout' || status === 'failed' };
}
