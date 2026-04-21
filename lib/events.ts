type Listener = (data: unknown) => void;
const channels = new Map<string, Set<Listener>>();

export function emit(channel: string, data: unknown) {
  for (const fn of channels.get(channel) || []) fn(data);
}

export function subscribe(channel: string, fn: Listener): () => void {
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel)!.add(fn);
  return () => channels.get(channel)?.delete(fn);
}
