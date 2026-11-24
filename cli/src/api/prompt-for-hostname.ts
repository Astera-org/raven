import type { Prompter } from "#src/prompts.js";
import { getHostnames } from "./get-hostname.js";

const MESSAGE = "What should this computer be called?";
const CUSTOM = "custom";

export async function promptForHostname(prompter: Prompter): Promise<string> {
  const choice = await prompter.select({
    message: MESSAGE,
    options: [
      { value: CUSTOM, label: "Enter a custom name" },
      { value: "hostname", label: "Choose from system hostname options" },
    ],
  });
  if (choice === CUSTOM) return promptForCustomName(prompter);

  const hostnames = getHostnames();
  const hostnameChoice = await prompter.select({
    message: MESSAGE,
    options: [
      ...hostnames.map((label, index) => ({ value: String(index), label })),
      { value: CUSTOM, label: "Enter a custom name" },
    ],
  });
  if (hostnameChoice === CUSTOM) return promptForCustomName(prompter);
  return hostnames[Number(hostnameChoice)] ?? promptForCustomName(prompter);
}

async function promptForCustomName(prompter: Prompter): Promise<string> {
  const name = await prompter.text({
    message: "Computer name",
    validate: (value) => (value.trim() ? undefined : "Name is required"),
  });
  return name.trim();
}
