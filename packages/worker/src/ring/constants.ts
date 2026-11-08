/**
 * WIR0 frozen slot-format constants (P6 plan, docs/jira/v26.11.8/plans/06-sab-ring.md).
 *
 * Slot = 4096B: 16B big-endian header + up to 4080B payload.
 * Header layout (all u32 BE):
 *   [0..3]  magic 0x57495230 ("WIR0")
 *   [4..7]  payload length in bytes
 *   [8..11] CRC32 (IEEE, over payload bytes only)
 *   [12..15] ordinal (monotonic frame sequence number)
 */

/** Magic word 0x57495230 = "WIR0" (ASCII big-endian). */
export const WIRE_MAGIC = 0x5749_5230;

/** Fixed slot size in bytes. */
export const SLOT_SIZE = 4096;

/** Frame header size in bytes (4 x u32 BE). */
export const HEADER_SIZE = 16;

/** Maximum payload per slot: 4096 - 16 header bytes. */
export const MAX_PAYLOAD = SLOT_SIZE - HEADER_SIZE;

/** Control page occupies exactly one leading slot of the SAB. */
export const CONTROL_BYTES = SLOT_SIZE;

/**
 * Control-page Int32 word layout (Atomics-operated, never plain stores for
 * cursors; counters may be plain under SPSC but are Atomics for uniformity).
 */
export const CTRL_WRITE = 0;
export const CTRL_READ = 1;
export const CTRL_WRAPPED = 2;
export const CTRL_DROPPED = 3;
export const CTRL_CAPACITY = 4;
export const CTRL_READY = 5;
/** Number of Int32 words in the control page. */
export const CTRL_WORD_COUNT = 6;
