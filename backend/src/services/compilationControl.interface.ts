/** Operations JobService needs to control a running or queued compilation. */
export interface ICompilationControl {
  cancelCompilation(jobId: string, reason?: string): boolean;
}
