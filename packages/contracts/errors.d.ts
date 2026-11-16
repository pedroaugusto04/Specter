export interface UserFailure {
  title: string;
  description: string;
  nextStep: string;
}
export declare const USER_FAILURES: Readonly<
  Record<
    | 'resourceUnavailable'
    | 'accessBlocked'
    | 'requestTimedOut'
    | 'requestedDataUnavailable'
    | 'setupTimedOut'
    | 'compilerRateLimited'
    | 'setupUnavailable'
    | 'configurationRejected'
    | 'websiteUnavailable'
    | 'sessionUnavailable'
    | 'unsupported'
    | 'executionInterrupted'
    | 'planLimitReached'
    | 'requestFailed',
    UserFailure
  >
>;
export declare function getUserFailure(message: string): UserFailure;
