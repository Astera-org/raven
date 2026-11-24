import { confirm, isCancel, password, select, text } from "@clack/prompts";
import { CliError, ExitCode } from "./errors.js";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Interactive questions. Only used when stdin and stderr are terminals. */
export interface Prompter {
  text(options: {
    message: string;
    defaultValue?: string;
    /** Returns an error message to show, or undefined if the answer is fine. */
    validate?: (value: string) => string | undefined;
  }): Promise<string>;
  password(options: { message: string }): Promise<string>;
  confirm(options: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean>;
  select<T extends string>(options: {
    message: string;
    options: SelectOption<T>[];
  }): Promise<T>;
}

/** Prompts render on stderr so stdout stays clean for `--json` output. */
export class ClackPrompter implements Prompter {
  async text({
    message,
    defaultValue,
    validate,
  }: {
    message: string;
    defaultValue?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string> {
    const answer = await text({
      message,
      output: process.stderr,
      ...(defaultValue === undefined
        ? {}
        : { defaultValue, placeholder: defaultValue }),
      ...(validate === undefined
        ? {}
        : { validate: (value) => validate(value ?? "") }),
    });
    return answered(answer);
  }

  async password({ message }: { message: string }): Promise<string> {
    return answered(await password({ message, output: process.stderr }));
  }

  async confirm({
    message,
    initialValue,
  }: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean> {
    return answered(
      await confirm({ message, initialValue, output: process.stderr })
    );
  }

  async select<T extends string>({
    message,
    options,
  }: {
    message: string;
    options: SelectOption<T>[];
  }): Promise<T> {
    const answer = await select<T>({
      message,
      output: process.stderr,
      // Clack's option type is conditional on T, which a generic T can't satisfy.
      options: options as Parameters<typeof select<T>>[0]["options"],
    });
    return answered(answer);
  }
}

function answered<T>(answer: T): Exclude<T, symbol> {
  if (isCancel(answer)) throw new CliError("cancelled", ExitCode.General);
  return answer as Exclude<T, symbol>;
}
