# Audio Files Setup

This directory contains audio files for game sound effects.

## Audio Files (From Ludo-mg Repository)

The following audio files are integrated:

1. **sfx_dice_roll.mp3** - Sound played when the dice is rolled
2. **sfx_token_killed.mp3** - Sound played when a pawn captures/kills an opponent's pawn
3. **sfx_token_move.mp3** - Sound played when a pawn moves
4. **sfx_win.mp3** - Sound played when a player wins the game
5. **sfx_in_home.mp3** - Sound played when a token enters home
6. **sfx_click.mp3** - Available for UI clicks (not currently used)
7. **sfx_my_turn.mp3** - Available for turn notifications (not currently used)
8. **sfx_opp_turn.mp3** - Available for opponent turn notifications (not currently used)
9. **sfx_clock.mp3** - Available for timer/clock sounds (not currently used)

## Audio Files Status

✅ **All audio files have been copied from Ludo-mg repository!**

The files are located in: `assets/sounds/` in the Ludo-mg repository.

If you need to re-copy them:
```powershell
# From the project root
Copy-Item "C:\Users\ILYAAS ABDIRAHMAN\Downloads\Ludo-mg-main (1)\Ludo-mg-main\assets\sounds\*.mp3" -Destination "public\audio\" -Force
```

## Alternative: Download Free Sound Effects

If you can't find the audio files from Ludo-mg, you can use free sound effects from:
- [Freesound](https://freesound.org/)
- [Zapsplat](https://www.zapsplat.com/)
- [Mixkit](https://mixkit.co/free-sound-effects/)

## File Format

- **Format**: MP3 (recommended for web compatibility)
- **Alternative formats**: WAV, OGG (you may need to update `audioService.ts` to use these formats)

## Testing

After adding the audio files:
1. Start the development server: `npm run dev`
2. Play the game and verify sounds play for:
   - Dice rolls
   - Pawn captures
   - Player wins

## Note

Modern browsers may block autoplay audio. Users may need to interact with the page (click, tap) before audio can play. This is a browser security feature.

