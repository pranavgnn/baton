import { describe, expect, it } from "vitest";

import { emailJobSchema } from "@/lib/mail/job";

const valid = {
  id: "job-1",
  applicationId: "app-1",
  nodeId: "node_email_ack",
  nodeLabel: "Acknowledge Submission",
  templateId: "template-1",
  recipients: ["faculty@example.org"],
  variables: { applicant_name: "Dr. Anita Rao" },
};

describe("emailJobSchema", () => {
  it("accepts a well-formed job", () => {
    const parsed = emailJobSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("survives a round trip through the queue's JSON encoding", () => {
    const parsed = emailJobSchema.safeParse(JSON.parse(JSON.stringify(valid)));
    expect(parsed.success && parsed.data).toEqual(valid);
  });

  it("rejects a job with no recipients", () => {
    // The publisher filters these out; the worker must not trust that.
    expect(emailJobSchema.safeParse({ ...valid, recipients: [] }).success).toBe(
      false,
    );
  });

  it("rejects a malformed recipient address", () => {
    expect(
      emailJobSchema.safeParse({ ...valid, recipients: ["not-an-email"] })
        .success,
    ).toBe(false);
  });

  it("rejects a job with no template to render", () => {
    expect(emailJobSchema.safeParse({ ...valid, templateId: "" }).success).toBe(
      false,
    );
  });

  it("rejects a job that names no application", () => {
    const withoutApplication = { ...valid, applicationId: undefined };
    expect(emailJobSchema.safeParse(withoutApplication).success).toBe(false);
  });

  it("accepts a job with several recipients", () => {
    const parsed = emailJobSchema.safeParse({
      ...valid,
      recipients: ["head@example.org", "registrar@example.org"],
    });
    expect(parsed.success).toBe(true);
  });

  it("keeps the template variables verbatim", () => {
    const variables = {
      applicant_name: "Dr. Anita Rao",
      application_reference: "APP-2026-0001",
      last_outcome: "Recommend",
    };
    const parsed = emailJobSchema.safeParse({ ...valid, variables });
    expect(parsed.success && parsed.data.variables).toEqual(variables);
  });
});
