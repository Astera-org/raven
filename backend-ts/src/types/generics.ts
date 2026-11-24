export type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

export type AsArray<T> = T extends undefined
  ? []
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends any[]
    ? T
    : [T];

// `undefined` is allowed so objects with optional fields fit; JSON.stringify
// drops those keys.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };
