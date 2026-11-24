/**
 * A DataCite request that failed without an answer: no response (network
 * failure, timeout), an unexpected status, or an unreadable body. `status`
 * tells a caller whether retrying may help (null, 429 or 5xx) or not.
 */
export class DataciteRequestError extends Error {
  override name = "DataciteRequestError";
  constructor(
    public doi: string,
    // Null when no response arrived.
    public status: number | null,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}
