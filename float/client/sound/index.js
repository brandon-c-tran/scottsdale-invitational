/* The sound API (float/PROTOCOL.md "Sound"). This file is a STUB: silent
   hooks with the real signatures, so the screen and the controller can call
   them now. The sound build replaces the bodies. Everything sounds through
   Field Day's engine (src/lib/sound.js playSound / cueAt), the only module
   that touches Web Audio. */

/* The screen's sound: the river, the music, every moment, on the room bus.
   net: the connection from net.js; it reads room, snap and ev messages. */
export function useFloatScreenSound(net) { void net; }

/* The phone's sound: your own strokes, your flip, your finish, on the you bus. */
export function useFloatControllerSound(net, { me = null } = {}) { void net; void me; }

/* Call inside a tap, so iOS lets sound start. */
export function unlockFloatSound() {}
