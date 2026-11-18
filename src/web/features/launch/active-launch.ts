const storageKey = (workspaceId: string) =>
  `lanzador.activeLaunch.${workspaceId}`;

export const rememberActiveLaunch = (workspaceId: string, launchId: string) =>
  localStorage.setItem(storageKey(workspaceId), launchId);

export const recallActiveLaunch = (workspaceId: string) =>
  localStorage.getItem(storageKey(workspaceId));

export const forgetActiveLaunch = (workspaceId: string) =>
  localStorage.removeItem(storageKey(workspaceId));

export function syncActiveLaunch(
  workspaceId: string,
  launchId: string,
  finished: boolean,
) {
  if (!finished) rememberActiveLaunch(workspaceId, launchId);
  else if (recallActiveLaunch(workspaceId) === launchId)
    forgetActiveLaunch(workspaceId);
}
