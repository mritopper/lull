import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { audio } from './audio.js';
import { LullSystem } from './lull-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(LullSystem);

  const overlay = document.getElementById('landing');
  const enter = document.getElementById('enter-xr') as HTMLButtonElement | null;
  const preview = document.getElementById('preview') as HTMLButtonElement | null;
  const note = document.getElementById('xr-note');

  const xrSupported = 'xr' in navigator;
  if (enter) {
    if (!world.xrEnabled || !xrSupported) {
      enter.disabled = true;
      if (note) note.textContent = 'Open this page in the Meta Quest Browser to enter. You can preview it here in the meantime.';
    }
    enter.addEventListener('click', () => {
      audio.start();
      world.launchXR();
    });
  }
  preview?.addEventListener('click', () => {
    audio.start();
    overlay?.classList.add('hidden');
  });

  world.visibilityState.subscribe((s) => {
    if (s === VisibilityState.NonImmersive) overlay?.classList.remove('hidden');
    else overlay?.classList.add('hidden');
  });
});
