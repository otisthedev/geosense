import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import type { BroadcastEvent, RoomPlayer } from './types';

let ch: RealtimeChannel | null = null;

export async function openChannel(
  roomId: string,
  onEvent: (e: BroadcastEvent) => void,
  onPlayers: (p: RoomPlayer[]) => void,
): Promise<void> {
  closeChannel();

  ch = supabase.channel(`room:${roomId}`, {
    config: { broadcast: { self: true } },
  });

  ch.on('broadcast', { event: '*' }, ({ payload }) => {
    onEvent(payload as BroadcastEvent);
  });

  ch.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
    async () => {
      const { data } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at');
      if (data) onPlayers(data as RoomPlayer[]);
    },
  );

  // Await confirmed subscription so no events are missed before we're ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      closeChannel();
      reject(new Error('Channel subscribe timed out'));
    }, 10_000);
    ch!.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        closeChannel();
        reject(new Error(status));
      }
    });
  });
}

export function broadcast(event: BroadcastEvent): void {
  ch?.send({ type: 'broadcast', event: event.type, payload: event });
}

export function closeChannel(): void {
  ch?.unsubscribe();
  ch = null;
}
