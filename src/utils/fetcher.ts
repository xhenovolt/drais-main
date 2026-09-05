export const fetcher = async <T = unknown>(url: string): Promise<T> => {
  const response = await fetch(url);

  // Parse the body even on failure — the API sends `{ success:false, error }`
  // with the real reason (e.g. "Forbidden: missing permission ..."). Throwing
  // before reading it lost that message and always reported a bare HTTP code,
  // so a permission-denied user saw the same generic error as a real outage.
  let body: any = null;
  try { body = await response.json(); } catch { /* no/invalid JSON body */ }

  if (!response.ok || body?.success === false) {
    const message = body?.error || body?.message || `HTTP error! status: ${response.status}`;
    const err = new Error(typeof message === 'string' ? message : 'Request failed') as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return body as T;
};

export default fetcher;
