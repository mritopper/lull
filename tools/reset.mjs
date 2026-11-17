// Clear on-device progress so the demo starts from a first night.
export default async function run({ frame }) {
  return await frame.evaluate(() => { localStorage.removeItem('lull.progress.v1'); return 'cleared'; });
}
