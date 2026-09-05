import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { env } from "@/lib/env";

/**
 * Responsive shell every outgoing message is wrapped in. Admin-authored HTML is
 * injected verbatim into the content slot; only this shell owns layout.
 *
 * Email clients ignore stylesheets and CSS custom properties, so the inline
 * values below are the one place in the codebase where colours are literal.
 * They mirror the light-theme tokens in `app/globals.css`.
 */
const palette = {
  page: "#f4f5f8",
  card: "#ffffff",
  border: "#dcdfe6",
  heading: "#12213d",
  text: "#2b3446",
  muted: "#6a7383",
  brand: "#173a6b",
};

const styles = {
  body: {
    backgroundColor: palette.page,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: "24px 0",
  },
  container: {
    backgroundColor: palette.card,
    border: `1px solid ${palette.border}`,
    borderRadius: "8px",
    margin: "0 auto",
    maxWidth: "600px",
    overflow: "hidden",
    width: "100%",
  },
  header: {
    backgroundColor: palette.brand,
    padding: "20px 32px",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: "24px",
    margin: 0,
  },
  headerSubtitle: {
    color: "#c9d4e6",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "2px 0 0",
  },
  content: {
    color: palette.text,
    fontSize: "14px",
    lineHeight: "22px",
    padding: "28px 32px",
  },
  hr: {
    borderColor: palette.border,
    margin: 0,
  },
  footer: {
    color: palette.muted,
    fontSize: "12px",
    lineHeight: "18px",
    padding: "16px 32px 24px",
  },
  link: {
    color: palette.brand,
  },
} as const;

export type EmailShellProps = {
  preview: string;
  heading?: string;
  /** Admin-authored HTML fragment produced by the template editor. */
  html: string;
};

export function EmailShell({ preview, heading, html }: EmailShellProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerTitle}>Baton</Text>
            <Text style={styles.headerSubtitle}>
              {heading ?? "Application portal"}
            </Text>
          </Section>
          <Section style={styles.content}>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </Section>
          <Hr style={styles.hr} />
          <Section style={styles.footer}>
            <Text style={{ margin: 0 }}>
              This is an automated message from the application portal. Please
              do not reply to this email.
            </Text>
            <Text style={{ margin: "6px 0 0" }}>
              <Link href={env.NEXT_PUBLIC_APP_URL} style={styles.link}>
                Open the portal
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
