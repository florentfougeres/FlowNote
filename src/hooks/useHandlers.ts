import { useRef } from "react";

// oxlint-disable-next-line typescript/no-explicit-any -- handlers of any signature
type Handlers = Record<string, ((...args: any[]) => unknown) | undefined>;

/**
 * Handlers whose identity never changes but which always call the latest
 * version passed: a component wrapped in `memo` that receives them is not
 * rendered again because the app created new closures. An absent handler
 * stays absent (`undefined`), so optional props keep their meaning.
 */
export function useHandlers<T extends Handlers>(handlers: T): T {
  const latest = useRef(handlers);
  latest.current = handlers;
  const stable = useRef<Handlers>({});
  const result: Handlers = {};
  for (const key of Object.keys(handlers)) {
    if (handlers[key] === undefined) {
      result[key] = undefined;
      continue;
    }
    stable.current[key] ??= (...args: unknown[]) => latest.current[key]?.(...args);
    result[key] = stable.current[key];
  }
  return result as T;
}
