import { getConfig } from "#src/config.js";
import { logger } from "./logger.js";

const LINEAR_API_URL = "https://api.linear.app/graphql";

// ---------------------------------------------------------------------------
// GraphQL helper
// ---------------------------------------------------------------------------

async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T | null> {
  const cfg = getConfig();
  if (!cfg.LINEAR_API_KEY) {
    logger.warn("Linear API not configured. Skipping request.");
    return null;
  }
  try {
    const resp = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: cfg.LINEAR_API_KEY,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await resp.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (!resp.ok || body.errors) {
      const child = logger.child({
        status: resp.status,
        errors: body.errors ?? body,
      });
      child.error("Linear API error");
      return null;
    }
    return body.data ?? null;
  } catch (error) {
    const child = logger.child({ error });
    child.error("Linear API request failed");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Issue creation
// ---------------------------------------------------------------------------

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }
`;

export interface LinearIssue {
  id: string;
  identifier: string;
  url: string;
}

export async function createLinearIssue(input: {
  title: string;
  description: string;
  dueDate?: string | null;
}): Promise<LinearIssue | null> {
  const cfg = getConfig();
  if (!cfg.LINEAR_TEAM_ID) {
    logger.warn("Linear team not configured. Skipping issue creation.");
    return null;
  }
  const data = await linearGraphql<{
    issueCreate: { success: boolean; issue: LinearIssue | null };
  }>(ISSUE_CREATE_MUTATION, {
    input: {
      teamId: cfg.LINEAR_TEAM_ID,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate || undefined,
      stateId: cfg.LINEAR_TRIAGE_STATE_ID || undefined,
    },
  });
  if (!data?.issueCreate.success || !data.issueCreate.issue) return null;
  return data.issueCreate.issue;
}

// ---------------------------------------------------------------------------
// Screenshot attachment (best-effort, called after the issue exists)
// ---------------------------------------------------------------------------

const FILE_UPLOAD_MUTATION = `
  mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
    fileUpload(contentType: $contentType, filename: $filename, size: $size) {
      success
      uploadFile {
        uploadUrl
        assetUrl
        headers {
          key
          value
        }
      }
    }
  }
`;

const ATTACHMENT_CREATE_MUTATION = `
  mutation AttachmentCreate($input: AttachmentCreateInput!) {
    attachmentCreate(input: $input) {
      success
    }
  }
`;

export async function attachFileToIssue(
  issueId: string,
  file: File
): Promise<boolean> {
  const uploadData = await linearGraphql<{
    fileUpload: {
      success: boolean;
      uploadFile: {
        uploadUrl: string;
        assetUrl: string;
        headers: Array<{ key: string; value: string }>;
      } | null;
    };
  }>(FILE_UPLOAD_MUTATION, {
    contentType: file.type || "application/octet-stream",
    filename: file.name,
    size: file.size,
  });
  if (!uploadData?.fileUpload.success || !uploadData.fileUpload.uploadFile)
    return false;
  const { uploadUrl, assetUrl, headers } = uploadData.fileUpload.uploadFile;

  try {
    const putResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        ...Object.fromEntries(headers.map((h) => [h.key, h.value])),
      },
      body: await file.arrayBuffer(),
      signal: AbortSignal.timeout(30000),
    });
    if (!putResp.ok) {
      const child = logger.child({ status: putResp.status });
      child.error("Linear file upload failed");
      return false;
    }
  } catch (error) {
    const child = logger.child({ error });
    child.error("Linear file upload request failed");
    return false;
  }

  const attachData = await linearGraphql<{
    attachmentCreate: { success: boolean };
  }>(ATTACHMENT_CREATE_MUTATION, {
    input: {
      issueId,
      url: assetUrl,
      title: file.name,
    },
  });
  return Boolean(attachData?.attachmentCreate.success);
}
