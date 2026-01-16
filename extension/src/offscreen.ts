// Offscreen document for audio playback
// Service workers cannot use Web Audio API, so we use an offscreen document

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Play a single tick sound
function playTick(ctx: AudioContext, startTime: number): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Short, crisp tick using a higher frequency square wave
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(1800, startTime);

  // Very short envelope for a sharp click
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.005);
  gainNode.gain.linearRampToValueAtTime(0, startTime + 0.03);

  oscillator.start(startTime);
  oscillator.stop(startTime + 0.03);
}

// Play a satisfying tick-tick sound
function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      // Resume in case autoplay policies suspended the context.
      void ctx.resume();
    }
    const now = ctx.currentTime;

    // Two ticks in quick succession
    playTick(ctx, now);
    playTick(ctx, now + 0.08);
  } catch (error) {
    console.error('[Claude Notifier Offscreen] Error playing sound:', error);
  }
}

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message: { type: string }) => {
  if (message.type === 'PLAY_SOUND') {
    playNotificationSound();
  }
});
