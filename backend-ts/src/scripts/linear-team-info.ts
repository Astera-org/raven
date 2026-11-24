import { getConfig, initConfig } from "#src/config.js";

interface WorkflowState {
  id: string;
  name: string;
  type: string;
}

interface Team {
  id: string;
  name: string;
  key: string;
  states: { nodes: WorkflowState[] };
}

const TEAM_INFO_QUERY = `
  query TeamInfo($key: String!) {
    teams(filter: { key: { eq: $key } }) {
      nodes {
        id
        name
        key
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  }
`;

async function main() {
  const teamKey = process.argv[2];
  if (!teamKey) {
    // eslint-disable-next-line no-console
    console.error("Usage: pnpm linear:team-info <TEAM_KEY>");
    // eslint-disable-next-line no-console
    console.error("Example: pnpm linear:team-info STACKS");
    process.exit(1);
  }

  initConfig(process.env.RAVEN_CONFIG || undefined);
  const apiKey = getConfig().LINEAR_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error(
      "LINEAR_API_KEY is not set (in raven.toml or as an env var). Set it and re-run."
    );
    process.exit(1);
  }

  const resp = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: TEAM_INFO_QUERY,
      variables: { key: teamKey },
    }),
  });

  const body = (await resp.json()) as {
    data?: { teams: { nodes: Team[] } };
    errors?: Array<{ message: string }>;
  };

  if (!resp.ok || body.errors) {
    // eslint-disable-next-line no-console
    console.error("Linear API error:", resp.status, body.errors ?? body);
    process.exit(1);
  }

  const team = body.data?.teams.nodes[0];
  if (!team) {
    // eslint-disable-next-line no-console
    console.error(`No team found with key "${teamKey}"`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`Team: ${team.name} (${team.key})`);
  // eslint-disable-next-line no-console
  console.log(`  LINEAR_TEAM_ID=${team.id}`);

  // eslint-disable-next-line no-console
  console.log("\nWorkflow states:");
  for (const state of team.states.nodes) {
    const marker = state.type === "triage" ? "  <-- triage" : "";
    // eslint-disable-next-line no-console
    console.log(
      `  ${state.type.padEnd(12)} ${state.name.padEnd(20)} ${state.id}${marker}`
    );
  }

  const triage = team.states.nodes.find((s) => s.type === "triage");
  if (triage) {
    // eslint-disable-next-line no-console
    console.log(`\n  LINEAR_TRIAGE_STATE_ID=${triage.id}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "\nNo triage state found for this team. Is issue triage enabled for it?"
    );
  }
}

main();
