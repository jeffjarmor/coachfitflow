/** Completes a modal's exit before its owning route is destroyed. */
export async function fadeOutModal(modal?: HTMLElement | null): Promise<void> {
  if (!modal?.isConnected) return;
  if (modal.tagName === 'DIALOG') {
    (modal as HTMLDialogElement).close();
  } else {
    modal.classList.remove('modal-fade-in');
    modal.classList.add('modal-fade-out');
  }
  await Promise.all(modal.getAnimations().map(animation => animation.finished.catch(() => undefined)));
}
