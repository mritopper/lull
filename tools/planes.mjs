export default async function run({ frame }) {
  return await frame.evaluate(() => {
    const l = window.lull;
    const ents = [...l.queries.planes.entities];
    return {
      inXR: l.inXR, deskFound: l.deskFound, n: ents.length,
      planes: ents.map((e) => {
        const o = e.object3D; o.updateWorldMatrix(true, false);
        const p = [...e.getComponents?.() ?? []];
        const pl = o.userData?.plane;
        const v = o.getWorldPosition(o.position.clone());
        return { pos: v.toArray().map((x) => +x.toFixed(2)) };
      }),
    };
  });
}
