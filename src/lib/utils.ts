// For NodeJS.Timeout type
// Utility functions for timeouts and retries
export async function withTimeout<T>(promise: Promise<T>, ms: number, name: string = 'operation'): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${name} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

export async function retry<T>(fn: () => Promise<T>, attempts: number = 3, baseDelay: number = 300): Promise<T> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise(res => setTimeout(res, baseDelay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}
