/** SRT subtitle parsing → cue list, for syncing audiobook playback to text. */

export interface Cue {
  /** seconds */
  start: number;
  /** seconds */
  end: number;
  text: string;
}

/** "HH:MM:SS,mmm" (or "." ms sep) → seconds. NaN-safe: bad stamp → 0. */
function stampToSeconds(stamp: string): number {
  const m = stamp.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  const [, h, min, s, ms] = m;
  return +h * 3600 + +min * 60 + +s + +ms / 1000;
}

/** Parse SRT text into cues. Tolerates blank lines, CRLF, missing indices. */
export function parseSrt(srt: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = srt.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [from, to] = timeLine.split('-->');
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join('\n')
      .trim();
    if (!text) continue;
    cues.push({ start: stampToSeconds(from), end: stampToSeconds(to), text });
  }
  return cues;
}

/** Active cue for a playback time (seconds). Linear scan; cue lists are small. */
export function cueAt(cues: Cue[], t: number): Cue | null {
  return cues.find((c) => t >= c.start && t < c.end) || null;
}
