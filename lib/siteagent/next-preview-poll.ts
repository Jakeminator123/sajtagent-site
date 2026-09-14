/** 404 means V2 is off, incomplete, or the project is gone — stop the Builder poller. */
export function shouldIdleNextPreviewPoll(status: number): boolean {
  return status === 404
}
