// Capture the managed IWSDK browser as JPEG frames via a CDP screencast.
// Duration (seconds) is read from .recording/duration.txt; frames land in .recording/frames/.
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ cdp, workspaceRoot }) {
  const dir = join(workspaceRoot, '.recording');
  const frames = join(dir, 'frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const seconds = Number(readFileSync(join(dir, 'duration.txt'), 'utf8').trim()) || 20;
  const index = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const name = `f${String(n++).padStart(5, '0')}.jpg`;
    writeFileSync(join(frames, name), Buffer.from(f.data, 'base64'));
    index.push([name, f.metadata.timestamp]);
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  await cdp.send('Page.stopScreencast');
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index));
  return { frames: n };
}
