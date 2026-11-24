/**
 * Full page navigation. Used after logout so every cached private response is
 * discarded with the page, and no screen briefly reacts to a cleared session.
 */
export function leaveTo(path: string): void {
  window.location.replace(path);
}
