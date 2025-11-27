/**
 * Audio Service for playing game sound effects
 */

class AudioService {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private enabled: boolean = true;
  private volume: number = 0.7;

  /**
   * Preload a sound file
   */
  private loadSound(name: string, path: string): HTMLAudioElement {
    const audio = new Audio(path);
    audio.volume = this.volume;
    audio.preload = 'auto';
    
    // Handle loading errors gracefully
    audio.addEventListener('error', (e) => {
      console.warn(`⚠️ Failed to load audio: ${name}`, e);
    });
    
    this.sounds.set(name, audio);
    return audio;
  }

  /**
   * Initialize audio service and preload sounds
   */
  constructor() {
    this.loadSound('diceRoll', '/audio/sfx_dice_roll.mp3');
    this.loadSound('tokenKilled', '/audio/sfx_token_killed.mp3');
    this.loadSound('inHome', '/audio/sfx_in_home.mp3');
    this.loadSound('tokenMove', '/audio/sfx_token_move.mp3');
    this.loadSound('win', '/audio/sfx_win.mp3');
    this.loadSound('click', '/audio/sfx_click.mp3');
    this.loadSound('clock', '/audio/sfx_clock.mp3');
    this.loadSound('my_turn', '/audio/sfx_my_turn.mp3');
    this.loadSound('opp_turn', '/audio/sfx_opp_turn.mp3');
  }

  /**
   * Play a sound effect
   */
  play(soundName: string): void {
    if (!this.enabled) return;

    const audio = this.sounds.get(soundName);
    if (!audio) {
      console.warn(`⚠️ Sound not found: ${soundName}`);
      return;
    }

    try {
      // Clone the audio element to allow overlapping sounds
      const audioClone = audio.cloneNode() as HTMLAudioElement;
      audioClone.volume = this.volume;
      audioClone.play().catch((error) => {
        // Silently handle autoplay restrictions
        console.debug(`Audio play prevented (likely autoplay restriction): ${soundName}`);
      });
    } catch (error) {
      console.warn(`⚠️ Error playing sound ${soundName}:`, error);
    }
  }

  /**
   * Enable or disable audio
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    // Update volume for all loaded sounds
    this.sounds.forEach((audio) => {
      audio.volume = this.volume;
    });
  }

  /**
   * Check if audio is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume;
  }
}

// Export singleton instance
export const audioService = new AudioService();





