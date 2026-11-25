const playback = new WeakMap<HTMLElement, Promise<void>>();

export function trackReward(body: HTMLElement, finished: Promise<void>) {
  playback.set(body, finished);
}

export function rewardFinished(body: HTMLElement | null) {
  return body ? playback.get(body) : undefined;
}

export function clearReward(body: HTMLElement) {
  playback.delete(body);
}
